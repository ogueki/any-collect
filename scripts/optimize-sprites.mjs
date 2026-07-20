// スプライト/背景画像を WebP へ最適化する（スプライト＝最大 1024px／背景＝最大 1536px）。
//
// なぜ: ChatGPT 等で書き出した PNG は 1 枚 ~1MB と重く、スマホの初回ロード/decode が遅い。
//      表示サイズに合わせて WebP に落とすと画質を保ったまま激減する。
//      背景（ホーム全画面）はスプライトより大きく映るので上限を 1536px にしている。
//
// ルール: `src/characters/<id>/sprites/` `backgrounds/` `transitions/` に画像（png/jpg）を
//        追加したら必ず `npm run sprites:optimize` を実行してから commit する（claude.md 参照）。
//        既に webp のものは対象外なので、何度実行しても安全（冪等）。

import { readdir, rm, stat } from 'node:fs/promises'
import { join, extname, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const CHARACTERS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'characters')
const MAX_DIMENSION = 1024
const MAX_BACKGROUND_DIMENSION = 1536
const WEBP_QUALITY = 85
// 最適化対象（webp は既に最適化済みなので対象外）。
const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg'])

/** ディレクトリを再帰的に走査してファイルパスを列挙する。 */
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

let converted = 0
let savedBytes = 0

for await (const file of walk(CHARACTERS_DIR)) {
  const normalized = file.replaceAll('\\', '/')
  const isBackground = normalized.includes('/backgrounds/')
  // sprites / backgrounds / transitions 配下のみ（transitions＝場面転換の一枚絵）
  if (
    !normalized.includes('/sprites/') &&
    !isBackground &&
    !normalized.includes('/transitions/')
  )
    continue
  if (!SOURCE_EXTENSIONS.has(extname(file).toLowerCase())) continue

  const max = isBackground ? MAX_BACKGROUND_DIMENSION : MAX_DIMENSION
  const out = join(dirname(file), `${basename(file, extname(file))}.webp`)
  const before = (await stat(file)).size
  const info = await sharp(file)
    // 長辺を上限以内に収める（小さい画像は拡大しない）。透過は WebP がそのまま保持。
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(out)
  await rm(file) // 元の png/jpg は削除（webp に置き換え）

  converted++
  savedBytes += before - info.size
  console.log(
    `✓ ${normalized.split('/characters/')[1]} → ${basename(out)}  ` +
      `${(before / 1024).toFixed(0)}KB → ${(info.size / 1024).toFixed(0)}KB`,
  )
}

console.log(
  converted === 0
    ? '最適化対象の png/jpg はありませんでした（すべて webp 済み）。'
    : `done: ${converted} 枚を WebP 化（合計 ${(savedBytes / 1024 / 1024).toFixed(1)}MB 削減）`,
)
