/** アプリ全体で共有する型定義 */

import type { FairyExpression } from '../lib/character/CharacterRenderer'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/**
 * アイテムの分類（図鑑のソート/絞り込み用の裏方データ）。
 * Rarity と同様に「安定キー」を保存し、表示カタカナは src/lib/category.ts の
 * CATEGORY_LABEL で変換する（ラベルを変えてもデータ移行が要らない）。
 */
export type ItemCategory = 'food' | 'creature' | 'nature' | 'gear' | 'toy' | 'wear' | 'other'

/** 図鑑に登録されるアイテム */
export interface Item {
  id: string
  name: string
  description: string
  category?: ItemCategory
  rarity?: Rarity
  /** 生成されたアイコン画像の URL（Supabase Storage 等） */
  iconUrl: string
  /** ISO 8601 */
  createdAt: string
}

/** 妖精の窯による合成の系譜 */
export interface Synthesis {
  id: string
  resultItemId: string
  parentAId: string
  parentBId: string
  createdAt: string
}

/** 妖精との会話メッセージ */
export interface ChatMessage {
  id: string
  role: 'user' | 'fairy'
  content: string
  createdAt: string
  /** 妖精メッセージに添えられた感情（立ち絵の表情に反映）。user では未使用 */
  emotion?: FairyExpression
}
