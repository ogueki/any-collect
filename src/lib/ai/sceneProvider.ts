import type { FairyExpression } from '../character/CharacterRenderer'

/**
 * 風景コメントプロバイダの抽象（STEP7）。
 * カメラで見せた景色から、妖精のひとことコメント＋感情を返す。
 * 実装はモデルを知らないクライアント側の薄いラッパで、鍵は /api/describe-scene に置く。
 */

/** 妖精の風景へのひとこと。コメント本文＋立ち絵に使う感情。 */
export interface SceneComment {
  comment: string
  /** モデルが選んだ感情。未取得/不正なら undefined（表示側で neutral 等にフォールバック） */
  emotion?: FairyExpression
}

export interface SceneProvider {
  /** 景色の撮影画像から、妖精のひとことコメント（＋感情）を生成する */
  describeScene(photo: Blob, opts?: { personaId?: string }): Promise<SceneComment>
}
