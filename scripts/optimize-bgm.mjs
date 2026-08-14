// BGM を配信向けのビットレートに落とす。
//
// なぜ: 配布サイトの mp3 は 256〜320kbps（音楽を主役として聴くための品質）で落ちてくるが、
//      **BGM は音量 0.35 で声の下に敷く音**なので、この品質は要らない。96kbps にすると
//      聴感はほぼ変わらないままサイズが 1/3 前後になる。効くのは**スマホの初回ダウンロード**
//      （屋外で開くアプリなので、鳴り出すまでの待ちがそのまま体験に出る）。
//
// ルール: `src/characters/<id>/bgm/` に mp3 を追加したら `npm run bgm:optimize` を実行してから
//        commit する（claude.md 参照）。**既に目標ビットレート以下のものは触らないので冪等。**
//
// 掛け声・台本の音声（`voice/`）は対象外＝短くて元から小さく、声そのものなので品質を保つ。

import { readdirSync, existsSync, statSync, renameSync, rmSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHARACTERS = join(ROOT, 'src', 'characters')
/** 目標ビットレート（kbps）。BGM 用途ではこれで十分。 */
const TARGET_KBPS = 96

const force = process.argv.includes('--force')

/**
 * mp3 の最初のフレームヘッダからビットレートを読む（外部ツール無しで判定するため）。
 * VBR だと先頭フレームの値になるが、**「もう十分小さいか」の判定にはこれで足りる**
 * （このスクリプトの出力は CBR なので、2回目以降は必ず目標値として読める＝冪等になる）。
 */
function readKbps(file) {
  const b = readFileSync(file)
  let i = 0
  while (i < b.length - 4 && !(b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0)) i++
  if (i >= b.length - 4) return null
  const header = (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]
  const table = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
  return table[(header >> 12) & 0xf] || null
}

let converted = 0
let savedBytes = 0

for (const charDir of readdirSync(CHARACTERS, { withFileTypes: true })) {
  if (!charDir.isDirectory()) continue
  const bgmDir = join(CHARACTERS, charDir.name, 'bgm')
  if (!existsSync(bgmDir)) continue

  for (const name of readdirSync(bgmDir)) {
    if (!name.toLowerCase().endsWith('.mp3')) continue
    const file = join(bgmDir, name)
    const before = statSync(file).size
    const kbps = readKbps(file)

    if (!force && kbps !== null && kbps <= TARGET_KBPS) {
      console.log(`スキップ ${charDir.name}/${name}（既に ${kbps}kbps）`)
      continue
    }

    const tmp = `${file}.tmp.mp3`
    execFileSync(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        file,
        '-c:a',
        'libmp3lame',
        '-b:a',
        `${TARGET_KBPS}k`,
        // ステレオのまま（環境音・アンビエントは左右の広がりが雰囲気そのもの）。
        '-ac',
        '2',
        '-ar',
        '44100',
        // ジャケット画像やタグを落とす（音以外はアプリに要らない）。
        '-map_metadata',
        '-1',
        '-vn',
        tmp,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    )

    const after = statSync(tmp).size
    if (after >= before) {
      // 落としたのに小さくならないなら元のほうが良い（既に低品質な素材など）。
      rmSync(tmp)
      console.log(`スキップ ${charDir.name}/${name}（小さくならない）`)
      continue
    }

    rmSync(file)
    renameSync(tmp, file)
    converted += 1
    savedBytes += before - after
    const mb = (n) => (n / 1048576).toFixed(2)
    console.log(
      `変換 ${charDir.name}/${name}: ${mb(before)}MB (${kbps ?? '?'}kbps) → ${mb(after)}MB (${TARGET_KBPS}kbps)`,
    )
  }
}

console.log(`\n${converted} 本を変換 / 削減 ${(savedBytes / 1048576).toFixed(2)}MB`)
if (converted > 0) console.log('mp3 を commit してください。')
