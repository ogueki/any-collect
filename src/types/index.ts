/** アプリ全体で共有する型定義 */

import type { FairyExpression } from '../lib/character/CharacterRenderer'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/**
 * アイテムの分類（図鑑のソート/絞り込み用の裏方データ）。
 * Rarity と同様に「安定キー」を保存し、表示カタカナは src/lib/category.ts の
 * CATEGORY_LABEL で変換する（ラベルを変えてもデータ移行が要らない）。
 */
export type ItemCategory = 'food' | 'creature' | 'nature' | 'gear' | 'toy' | 'wear' | 'other'

/**
 * アルバムに保存する写真（v2）。カメラで撮ってコレットが反応した1枚。
 * 画像は Blob で保持する（IndexedDB は Blob を直接保存でき、data URL より軽い）。
 * 既定ローカル、opt-in でクラウド（§9）。表示側は URL.createObjectURL で描画する。
 */
export interface Photo {
  id: string
  /** 撮影画像本体（JPEG 等） */
  blob: Blob
  /** 撮影時にコレットが返したひとこと（アルバム詳細で見返す） */
  comment?: string
  /** ひとことに添えられた感情（立ち絵の表情に使える） */
  emotion?: FairyExpression
  /** ISO 8601 */
  createdAt: string
}

/** アイテム（窯でアルバム写真から作る透過アイテム／妖精界に出現する） */
export interface Item {
  id: string
  name: string
  description: string
  category?: ItemCategory
  rarity?: Rarity
  /** 生成された透過アイコン画像の URL（Supabase Storage 等） */
  iconUrl: string
  /** 由来のアルバム写真 ID（v2・窯でのアイテム化元） */
  sourcePhotoId?: string
  /** 妖精界での配置（正規化座標 0..1。未配置なら未定義＝コレットが自動配置） */
  realmX?: number
  realmY?: number
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
