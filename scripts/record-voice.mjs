// 固定セリフ（台本）を事前収録する＝パートボイス（STEP3b／Ⅰ-6）。
//
// なぜ: 動的TTS は生成に1〜3秒かかるので、オンボの1言目や図鑑リビールでは
//      「文字が先に出て声が遅れて追いつく」＝間が抜ける。台本は固定なので先に録っておく。
//      録っておけば**実行時ゼロ円**（Fish を叩かない）＋レイテンシほぼゼロになる。
//
// 使い方: `npm run voice:record`（`.env` の FISH_AUDIO_API_KEY を使う）
//        `npm run voice:record -- --id=intro-1` … 台本の1本だけ録り直す（複数指定可）
//        `npm run voice:record -- --id=happy`   … その感情の掛け声だけ録り直す（--id は両方を受ける）
//        ※ 既にあるファイルは飛ばすので、録り直したい mp3 は先に消してから実行する。
//        `npm run voice:record -- --force`      … 変更が無くても全部録り直す
//        ⚠️ **--force は普段使わない。** Fish は同じ文面でも毎回わずかに読みが揺れ、いま入っている
//           mp3 は複数テイクを聴き比べて選んだもの（DECISIONS 2026-08-14）。force すると全部が
//           別の読みに置き換わる（ノイズが乗ることもある）。
//
// ルール: 台本（`src/features/onboarding/script.ts`）の文面・演技指示を直したら実行する。
//        録り直さなくても壊れない（クライアントは manifest と台本を突き合わせ、
//        ズレていたら動的TTS に落ちる＝古い音声で違うことを喋る事故は起きない）。
//        既に一致しているものは叩かないので、何度実行しても安全＆無料（冪等）。
//
// 収録するもの（2種類）:
//   ①台本の固定セリフ（オンボ）… `voice/<lineId>.mp3`。画面に同じ文字が出るので**文面と一致していること**が要る。
//   ②リアクションボイス（感情ごとの掛け声）… `voice/<感情>/<hash>.mp3`。**文字は画面に出ない**ので
//     一致の担保は不要。ファイル名を文面のハッシュにして、文面を変えたら別ファイル＝自動で録り直しになる。
//
// 出力: `src/characters/<id>/voice/` 以下 ＋ `manifest.json`（どちらもコミットする）。

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT_TS = join(ROOT, 'src', 'features', 'onboarding', 'script.ts')
const FISH_TTS_URL = 'https://api.fish.audio/v1/tts'

/** どのキャラの声で録るか。キャラを増やしたらここを増やす（voice.json と sprites と同じ単位）。 */
const CHARACTER_IDS = ['default']

const args = process.argv.slice(2)
const force = args.includes('--force')
const onlyIds = args.filter((a) => a.startsWith('--id=')).map((a) => a.slice('--id='.length))

/** `.env` を読む（この収録スクリプトはローカル実行専用＝鍵はクライアントに出ない）。 */
function loadEnvKey(name) {
  if (process.env[name]) return process.env[name]
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8')
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${name}=`))
    const value = line?.slice(name.length + 1).trim()
    return value || undefined
  } catch {
    return undefined
  }
}

/**
 * 台本（TypeScript）から収録対象の名簿を取り出す。
 * **台本を唯一の真実に保つため**にコピーを作らず、esbuild で束ねてその場で評価する
 * （このリポジトリで実績のある手口。型 import は esbuild が落とすので Node で素に動く）。
 */
/** TypeScript を1ファイルだけ評価する（型 import は esbuild が落とすので素の Node で動く）。 */
async function evalTs(path) {
  const bundled = await build({
    entryPoints: [path],
    // 束ねない＝TS を JS に落とすだけ。台本の import は型だけ（FairyExpression / SpokenLine）なので
    // esbuild が消し、素の Node でそのまま評価できる。
    bundle: false,
    format: 'esm',
    platform: 'node',
    write: false,
  })
  const code = bundled.outputFiles[0].text
  return await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

/** 台本（オンボの固定セリフ）の名簿を取る。台本を唯一の真実に保つためコピーを作らない。 */
async function loadLines() {
  const mod = await evalTs(SCRIPT_TS)
  if (!Array.isArray(mod.SPOKEN_FIXED_LINES)) {
    throw new Error('script.ts から SPOKEN_FIXED_LINES を読めませんでした')
  }
  return mod.SPOKEN_FIXED_LINES
}

/** キャラのリアクションボイス（感情→掛け声の配列）。無いキャラは空＝収録なしで黙る。 */
async function loadReactionLines(characterId) {
  const path = join(ROOT, 'src', 'characters', characterId, 'voiceLines.ts')
  if (!existsSync(path)) return {}
  const mod = await evalTs(path)
  return mod.REACTION_LINES ?? {}
}

/**
 * 掛け声の収録ファイル名＝**文面のハッシュ**。並べ替えても壊れず、文面を変えれば別ファイルになる
 * （＝録り直しが自動で起きる）。画面に文字が出ないので、台本のような一致チェックは要らない。
 */
function lineHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 8)
}

/**
 * 読み上げ本文の組み立て。**`api/tts.ts` と同じルール**にそろえる
 * ＝演技指示があればそれを角括弧で前置し、無ければ voice.json の感情タグに落とす。
 * （実行時とここで読み方が変わると、収録した声だけ雰囲気が違う事故になる）
 */
function buildSpokenText(line, voice) {
  const direction = line.direction?.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
  const prefix = direction ? `[${direction}]` : voice.expressionTag?.[line.expression]
  const text = line.text.replace(/[[\]]/g, '').trim().slice(0, 300)
  return prefix ? `${prefix} ${text}` : text
}

/**
 * 生成結果が長すぎないかの検査。
 *
 * **Fish は間欠的に「生成が止まらない」失敗をする**＝短い掛け声でも約47秒（761,938 bytes）の
 * 音声が返ってくる（異なる文面でバイト数が完全に一致する＝上限まで走ったときの固定長）。
 * そのまま書くと 700KB 超のゴミがコミットされ、再生すると延々と鳴る。**黙って通さない。**
 *
 * 文字数から妥当な上限を見積もって弾く（日本語で 1文字 ≒ 0.2〜0.3秒、mp3 で 16KB/秒 前後）。
 * 余裕を大きく取ってあるので、普通に録れたものが引っかかることはない。
 */
function tooLong(bytes, text) {
  return bytes > 40_000 + text.length * 14_000
}

async function synthesize(apiKey, voice, spokenText) {
  const res = await fetch(FISH_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      model: voice.model,
    },
    // 実行時（api/tts.ts）は latency:'low'＝発話開始を優先するが、収録は待てるので指定しない
    // ＝Fish の既定（品質優先）で録る。
    body: JSON.stringify({
      text: spokenText,
      reference_id: voice.referenceId,
      format: voice.format ?? 'mp3',
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Fish ${res.status}: ${detail.slice(0, 300)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** 妥当な長さのものが録れるまで録り直す（上の間欠失敗の対策）。 */
async function synthesizeChecked(apiKey, voice, spokenText, plainText, attempts = 3) {
  let last = null
  for (let i = 1; i <= attempts; i += 1) {
    last = await synthesize(apiKey, voice, spokenText)
    if (!tooLong(last.length, plainText)) return last
    process.stdout.write(`[長すぎ ${(last.length / 1024).toFixed(0)}KB → 録り直し ${i}/${attempts}] `)
  }
  throw new Error(
    `「${plainText}」が ${attempts} 回とも長すぎました（最後 ${last.length} bytes）。` +
      '文面を少し変えて再実行してください。',
  )
}

const apiKey = loadEnvKey('FISH_AUDIO_API_KEY')
if (!apiKey) {
  console.error('FISH_AUDIO_API_KEY が見つかりません（.env か環境変数に設定してください）')
  process.exit(1)
}

const lines = await loadLines()
// --id は台本のセリフID（intro-1 等）と感情名（happy 等）の両方を受ける。
// ここで台本にヒットしなくても感情側で拾えるので、この時点では打ち切らない。
const targets = onlyIds.length > 0 ? lines.filter((l) => onlyIds.includes(l.id)) : lines

let recorded = 0
let skipped = 0
let matched = targets.length

for (const characterId of CHARACTER_IDS) {
  const voice = JSON.parse(
    readFileSync(join(ROOT, 'src', 'characters', characterId, 'voice.json'), 'utf8'),
  )
  const outDir = join(ROOT, 'src', 'characters', characterId, 'voice')
  mkdirSync(outDir, { recursive: true })

  const manifestPath = join(outDir, 'manifest.json')
  const raw = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
  // 旧形式（台本の記録がトップレベルにフラットに並んでいた）を読み込めるようにする。
  // ここで形を変えても中身は同じなので、収録済みの音声が録り直しになることはない。
  const manifest = raw.lines || raw.reactions ? raw : { lines: raw }
  manifest.lines ??= {}
  manifest.reactions ??= {}

  for (const line of targets) {
    const file = join(outDir, `${line.id}.mp3`)
    const prev = manifest.lines[line.id]
    // クライアント（partVoice.ts）と同じ判定＝文面・感情・演技指示が全部一致していれば録り直さない。
    const upToDate =
      !force &&
      existsSync(file) &&
      prev &&
      prev.text === line.text &&
      prev.expression === line.expression &&
      prev.direction === line.direction
    if (upToDate) {
      skipped += 1
      continue
    }

    const spokenText = buildSpokenText(line, voice)
    process.stdout.write(`録音中 ${characterId}/${line.id} … `)
    const audio = await synthesizeChecked(apiKey, voice, spokenText, line.text)
    writeFileSync(file, audio)
    manifest.lines[line.id] = {
      text: line.text,
      expression: line.expression,
      direction: line.direction,
      recordedAt: new Date().toISOString(),
    }
    recorded += 1
    console.log(`${(statSync(file).size / 1024).toFixed(0)}KB`)
  }

  // 台本から消えたセリフの記録は残さない（音声ファイルは手で消す＝消し忘れても再生されない）。
  const liveIds = new Set(lines.map((l) => l.id))
  for (const id of Object.keys(manifest.lines)) {
    if (!liveIds.has(id)) {
      delete manifest.lines[id]
      console.log(`台本から消えたので manifest から外した: ${characterId}/${id}`)
    }
  }

  // ---- ②リアクションボイス（感情ごとの掛け声）----
  // 感情フォルダに置くだけでクライアントが拾う（立ち絵の sprites/<感情>/ と同じ流儀）。
  const reactionLines = await loadReactionLines(characterId)
  for (const [emotion, texts] of Object.entries(reactionLines)) {
    if (onlyIds.length > 0 && !onlyIds.includes(emotion)) continue
    matched += 1
    const emotionDir = join(outDir, emotion)
    mkdirSync(emotionDir, { recursive: true })
    const known = (manifest.reactions[emotion] ??= {})

    for (const text of texts) {
      const hash = lineHash(text)
      const file = join(emotionDir, `${hash}.mp3`)
      if (!force && existsSync(file) && known[hash] === text) {
        skipped += 1
        continue
      }
      // 掛け声は感情そのものなので、演技指示は付けず voice.json の感情タグに任せる。
      const tag = voice.expressionTag?.[emotion]
      const spokenText = tag ? `${tag} ${text}` : text
      process.stdout.write(`録音中 ${characterId}/${emotion}/「${text}」 … `)
      const audio = await synthesizeChecked(apiKey, voice, spokenText, text)
      writeFileSync(file, audio)
      known[hash] = text
      recorded += 1
      console.log(`${(statSync(file).size / 1024).toFixed(0)}KB`)
    }

    // 文面から消えた掛け声は録音ごと消す（ハッシュ名なので取り違えない）。
    const liveHashes = new Set(texts.map(lineHash))
    for (const hash of Object.keys(known)) {
      if (liveHashes.has(hash)) continue
      const stale = join(emotionDir, `${hash}.mp3`)
      if (existsSync(stale)) rmSync(stale)
      console.log(`文面から消えたので削除: ${characterId}/${emotion}/「${known[hash]}」`)
      delete known[hash]
    }
    if (Object.keys(known).length === 0) delete manifest.reactions[emotion]
  }

  // 感情ごと丸ごと消された場合（voiceLines.ts からキーが無くなった）の後片付け。
  // ⚠️ **消してよいのは manifest に載っている＝このスクリプトが録ったものだけ。**
  // 手で置いた音声（自作の掛け声）は manifest に載らないので、ここで巻き込んではいけない。
  // フォルダも「空になったときだけ」消す（readdir して中身ごと消すのは事故のもと）。
  for (const emotion of Object.keys(manifest.reactions)) {
    if (reactionLines[emotion]) continue
    const emotionDir = join(outDir, emotion)
    for (const hash of Object.keys(manifest.reactions[emotion])) {
      const stale = join(emotionDir, `${hash}.mp3`)
      if (existsSync(stale)) rmSync(stale)
    }
    if (existsSync(emotionDir) && readdirSync(emotionDir).length === 0) rmSync(emotionDir)
    delete manifest.reactions[emotion]
    console.log(`感情ごと消えたので削除: ${characterId}/${emotion}`)
  }

  // キーを並べておく＝差分が読みやすい。
  const sortKeys = (obj) =>
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)))
  const out = {
    lines: sortKeys(manifest.lines),
    reactions: sortKeys(
      Object.fromEntries(
        Object.entries(manifest.reactions).map(([emotion, m]) => [emotion, sortKeys(m)]),
      ),
    ),
  }
  writeFileSync(manifestPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8')
}

if (onlyIds.length > 0 && matched === 0) {
  console.error(`収録対象がありません（--id=${onlyIds.join(',')} は台本のIDにも感情名にも無い）`)
  process.exit(1)
}

console.log(`\n収録 ${recorded} 本 / 変更なし ${skipped} 本`)
if (recorded > 0) console.log('mp3 と manifest.json を commit してください。')
