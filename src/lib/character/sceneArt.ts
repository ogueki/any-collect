/**
 * 場面ごとの一枚絵（その部屋の背景／その場にいるコレット）を解決する。
 *
 * 画像の置き方：`src/characters/<id>/backgrounds/<場面>/<名前>.webp`
 *   - 場面＝フォルダ名（例: cauldron）。**ホーム背景と同じ `backgrounds/` に同居させる**＝
 *     `npm run sprites:optimize` の背景ルール（長辺 1536px・WebP）にそのまま乗るため。
 *     ホーム側（`homeBackground.ts`）は背景ID `tree-hollow` のフォルダしか見ないので、
 *     ここに場面を足してもホームの見た目には影響しない。
 *   - 名前＝`room`（部屋の背景）／`fairy`（その場のコレットの一枚絵）のように用途で決める。
 * 画像が未配置なら null を返し、呼び出し側は従来の見た目のままにする（置くだけで有効）。
 */

// ⚠️ 絶対パターン('/src/...')は Windows＋非ASCIIパスでキー変換が壊れるため、相対パターンを使う。
const sceneModules = import.meta.glob('../../characters/*/backgrounds/*/*.{webp,png,jpeg,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

// characterId → 場面 → 名前 → URL の索引を一度だけ構築する。
const sceneIndex: Record<string, Record<string, Record<string, string>>> = (() => {
  const index: Record<string, Record<string, Record<string, string>>> = {}
  for (const [path, url] of Object.entries(sceneModules)) {
    const m = path.match(/\/characters\/([^/]+)\/backgrounds\/([^/]+)\/([^/.]+)\.(?:webp|png|jpe?g)$/)
    if (!m) continue
    const byScene = (index[m[1]] ??= {})
    ;(byScene[m[2]] ??= {})[m[3]] = url
  }
  return index
})()

/** 指定の場面の一枚絵のURL。未配置なら null。 */
export function sceneArtUrl(characterId: string, scene: string, name: string): string | null {
  return sceneIndex[characterId]?.[scene]?.[name] ?? null
}
