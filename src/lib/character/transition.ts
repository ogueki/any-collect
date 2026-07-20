/**
 * 場面転換の一枚絵（キャラごと）を解決する。`homeBackground.ts` のミラー。
 *
 * 画像の置き方：`src/characters/<id>/transitions/<名前>.webp`
 *   - 透過 PNG/WebP 前提（暗い空間の上に重ねるため）。
 *   - png を置いたら `npm run sprites:optimize` で WebP 化してから commit（claude.md）。
 * 未配置なら null を返し、呼び出し側は演出を飛ばして通常表示に落とす。
 */

// ⚠️ 絶対パターン('/src/...')は Windows＋非ASCIIパスでキー変換が壊れるため、相対パターンを使う。
const transitionModules = import.meta.glob('../../characters/*/transitions/*.{webp,png,jpeg,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** 転換名（ファイル名）。増えたらここに足す。 */
export type TransitionName = 'treasure-open'

// characterId → 転換名 → URL の索引を一度だけ構築する。
const transitionIndex: Record<string, Partial<Record<TransitionName, string>>> = (() => {
  const index: Record<string, Partial<Record<TransitionName, string>>> = {}
  for (const [path, url] of Object.entries(transitionModules)) {
    const m = path.match(/\/characters\/([^/]+)\/transitions\/([^/.]+)\.(?:webp|png|jpe?g)$/)
    if (!m) continue
    index[m[1]] ??= {}
    index[m[1]][m[2] as TransitionName] = url
  }
  return index
})()

/** 場面転換の一枚絵の URL。未配置なら null（＝演出を飛ばす）。 */
export function transitionUrl(characterId: string, name: TransitionName): string | null {
  return transitionIndex[characterId]?.[name] ?? null
}
