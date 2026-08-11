import type { ItemCategory } from '../../types'

/**
 * 画像生成プロバイダの抽象。
 * 実装（GeminiImageProvider など）は STEP3 以降で追加し、
 * 実際の API キーを使う処理は Vercel Functions（/api）側に置く。
 * クライアントの実装はその /api を叩く薄いラッパになる。
 */

export interface GeneratedItem {
  /** 生成アイコン画像（data URL もしくはリモート URL） */
  imageUrl: string
  name: string
  /** アイテムの説明文（コミカル寄り・**コレットの口調ではない**）。たからばこの詳細に出る。 */
  description: string
  category?: ItemCategory
  /**
   * 生まれたアイテムを見たコレットのひとこと（召喚後にホームで喋る分）。
   * **無いことがある**＝合成（窯）は生成せず、召喚でもモデルが落としうる。
   * 表示側は必ず固定セリフのフォールバックを持つこと。
   */
  comment?: string
}

export interface ItemRef {
  imageUrl: string
  name: string
  description?: string
}

export interface ImageGenProvider {
  /** 撮影画像から統一絵柄のアイテムアイコン＋名前＋説明を生成する */
  generateItem(photo: Blob, opts?: { personaId?: string }): Promise<GeneratedItem>

  /** 2 つの素材を合成し、新しいアイテムを生成する（妖精の窯） */
  synthesize(a: ItemRef, b: ItemRef, opts?: { personaId?: string }): Promise<GeneratedItem>
}
