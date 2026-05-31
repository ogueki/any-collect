import type { Rarity } from '../../types'

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
  description: string
  category?: string
  rarity?: Rarity
}

export interface ItemRef {
  imageUrl: string
  name: string
}

export interface ImageGenProvider {
  /** 撮影画像から統一絵柄のアイテムアイコン＋名前＋説明を生成する */
  generateItem(photo: Blob, opts?: { personaId?: string }): Promise<GeneratedItem>

  /** 2 つの素材を合成し、新しいアイテムを生成する（妖精の窯） */
  synthesize(a: ItemRef, b: ItemRef, opts?: { personaId?: string }): Promise<GeneratedItem>
}
