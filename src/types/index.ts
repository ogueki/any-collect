/** アプリ全体で共有する型定義 */

import type { FairyExpression } from '../lib/character/CharacterRenderer'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/** 図鑑に登録されるアイテム */
export interface Item {
  id: string
  name: string
  description: string
  category?: string
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
