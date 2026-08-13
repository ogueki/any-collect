// 固定セリフ（台本）を事前収録する＝パートボイス（STEP3b／Ⅰ-6）。
//
// なぜ: 動的TTS は生成に1〜3秒かかるので、オンボの1言目や図鑑リビールでは
//      「文字が先に出て声が遅れて追いつく」＝間が抜ける。台本は固定なので先に録っておく。
//      録っておけば**実行時ゼロ円**（Fish を叩かない）＋レイテンシほぼゼロになる。
//
// 使い方: `npm run voice:record`（`.env` の FISH_AUDIO_API_KEY を使う）
//        `npm run voice:record -- --id=intro-1` … 1本だけ録り直す（複数指定可）
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
// 出力: `src/characters/<id>/voice/<lineId>.mp3` ＋ `manifest.json`（どちらもコミットする）。

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
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
async function loadLines() {
  const bundled = await build({
    entryPoints: [SCRIPT_TS],
    // 束ねない＝TS を JS に落とすだけ。台本の import は型だけ（FairyExpression / SpokenLine）なので
    // esbuild が消し、素の Node でそのまま評価できる。
    bundle: false,
    format: 'esm',
    platform: 'node',
    write: false,
  })
  const code = bundled.outputFiles[0].text
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  if (!Array.isArray(mod.SPOKEN_FIXED_LINES)) {
    throw new Error('script.ts から SPOKEN_FIXED_LINES を読めませんでした')
  }
  return mod.SPOKEN_FIXED_LINES
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

const apiKey = loadEnvKey('FISH_AUDIO_API_KEY')
if (!apiKey) {
  console.error('FISH_AUDIO_API_KEY が見つかりません（.env か環境変数に設定してください）')
  process.exit(1)
}

const lines = await loadLines()
const targets = onlyIds.length > 0 ? lines.filter((l) => onlyIds.includes(l.id)) : lines
if (targets.length === 0) {
  console.error(`収録対象がありません（--id=${onlyIds.join(',')} は台本に無い ID です）`)
  process.exit(1)
}

let recorded = 0
let skipped = 0

for (const characterId of CHARACTER_IDS) {
  const voice = JSON.parse(
    readFileSync(join(ROOT, 'src', 'characters', characterId, 'voice.json'), 'utf8'),
  )
  const outDir = join(ROOT, 'src', 'characters', characterId, 'voice')
  mkdirSync(outDir, { recursive: true })

  const manifestPath = join(outDir, 'manifest.json')
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : {}

  for (const line of targets) {
    const file = join(outDir, `${line.id}.mp3`)
    const prev = manifest[line.id]
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
    const audio = await synthesize(apiKey, voice, spokenText)
    writeFileSync(file, audio)
    manifest[line.id] = {
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
  for (const id of Object.keys(manifest)) {
    if (!liveIds.has(id)) {
      delete manifest[id]
      console.log(`台本から消えたので manifest から外した: ${characterId}/${id}`)
    }
  }

  // キーを並べておく＝差分が読みやすい。
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(manifestPath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
}

console.log(`\n収録 ${recorded} 本 / 変更なし ${skipped} 本`)
if (recorded > 0) console.log('mp3 と manifest.json を commit してください。')
