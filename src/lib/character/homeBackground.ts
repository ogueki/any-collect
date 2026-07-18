import { timeOfDayLabel } from '../../store/chatStore'

/**
 * ホーム背景（キャラの住まいのイラスト）を時間帯で解決する。
 *
 * 画像の置き方：`src/characters/<id>/backgrounds/<背景ID>/<slot>.webp`
 *   - 背景ID＝フォルダ名（例: tree-hollow）。将来のテーマ追加/販売はフォルダを足して
 *     ID を切り替えるだけにする（spec §15「背景IDで差し替え可能なアセット」）。
 *   - slot＝morning / day / evening / night の4枚（時間帯で切替）。
 * 画像が未配置なら null を返し、呼び出し側は従来の body グラデのままにする。
 */

// ⚠️ 絶対パターン('/src/...')は Windows＋非ASCIIパスでキー変換が壊れるため、相対パターンを使う。
const backgroundModules = import.meta.glob('../../characters/*/backgrounds/*/*.{webp,png,jpeg,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** 選択中の背景ID。当面は既定の1テーマ固定（差し替え対応時に設定化する）。 */
const HOME_BACKGROUND_ID = 'tree-hollow'

type BackgroundSlot = 'morning' | 'day' | 'evening' | 'night'

/** 会話接地と同じ時間帯区分（chatStore.timeOfDayLabel）を背景スロットへ写像する。 */
function slotForHour(hour: number): BackgroundSlot {
  switch (timeOfDayLabel(hour)) {
    case '朝':
      return 'morning'
    case '昼':
      return 'day'
    case '夕方':
      return 'evening'
    default:
      return 'night' // 夜・深夜
  }
}

// characterId → slot → URL の索引を一度だけ構築する。
const backgroundIndex: Record<string, Partial<Record<BackgroundSlot, string>>> = (() => {
  const index: Record<string, Partial<Record<BackgroundSlot, string>>> = {}
  for (const [path, url] of Object.entries(backgroundModules)) {
    const m = path.match(/\/characters\/([^/]+)\/backgrounds\/([^/]+)\/([^/.]+)\.(?:webp|png|jpe?g)$/)
    if (!m || m[2] !== HOME_BACKGROUND_ID) continue
    index[m[1]] ??= {}
    index[m[1]][m[3] as BackgroundSlot] = url
  }
  return index
})()

/** いまの時間帯のホーム背景URL。未配置の時間帯は昼→無ければ null。 */
export function homeBackgroundUrl(characterId: string, hour: number): string | null {
  const slots = backgroundIndex[characterId]
  if (!slots) return null
  return slots[slotForHour(hour)] ?? slots.day ?? null
}
