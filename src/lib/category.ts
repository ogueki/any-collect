import type { ItemCategory } from '../types'

/**
 * カテゴリの表示ラベル・並び順・正規化。図鑑のソート/絞り込みとカード詳細で共通利用する。
 * 保存される値は安定キー（'food' 等）で、画面に出すのはカタカナ。
 * ラベルを変えてもデータ移行が要らないのがこの分離の狙い。
 */

/** キー → 画面表示のカタカナラベル。 */
export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  food: 'フード',
  creature: 'クリーチャー',
  nature: 'ネイチャー',
  gear: 'ギア',
  toy: 'トイ',
  wear: 'ウェア',
  other: 'アザー',
}

/** チップやラベルに添える絵文字（cute UI 用）。 */
export const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  food: '🍙',
  creature: '🐾',
  nature: '🌿',
  gear: '⚙️',
  toy: '🧸',
  wear: '👕',
  other: '✨',
}

/**
 * 図鑑の「カテゴリ順」並び・チップの表示順。other は最後。
 * これが既知キーの正であり、toCategory の判定にも使う。
 */
export const CATEGORY_ORDER: readonly ItemCategory[] = [
  'food',
  'creature',
  'nature',
  'gear',
  'toy',
  'wear',
  'other',
]

/**
 * 任意の値を既知の ItemCategory に正規化する。既知キーはそのまま、
 * 未知文字列・空・undefined はすべて 'other' に倒す。
 * 旧データ（自由文字列で保存された category）の救済とフォールバックを1か所に集約する。
 */
export function toCategory(value?: string | null): ItemCategory {
  return (CATEGORY_ORDER as readonly string[]).includes(value ?? '')
    ? (value as ItemCategory)
    : 'other'
}
