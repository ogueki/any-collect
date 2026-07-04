import type { FairyExpression } from '../character/CharacterRenderer'
import type { ItemCategory, Rarity } from '../../types'

/**
 * 図鑑（Seek 型）判定プロバイダの抽象（STEP1d）。
 * カメラで撮った写真から、コレットのひとこと＋感情＋写っている主役を返す。
 * 実装はモデルを知らないクライアント側の薄いラッパで、鍵は /api/identify に置く
 * （SceneProvider と同じ単一差し替え点パターン）。
 */

/** 同定された写真の主役。bbox でクライアントがクロップする。 */
export interface IdentifiedSubject {
  name: string
  /** デデュープ用の安定キー（小文字英字/ローマ字の一般名・単数） */
  speciesKey: string
  category: ItemCategory
  rarity?: Rarity
  /** 主役を囲む矩形 [ymin, xmin, ymax, xmax]（0–1000 正規化） */
  bbox: [number, number, number, number]
}

export interface IdentifyResult {
  /** 撮った瞬間のコレットのひとこと（図鑑エントリの解説にも流用） */
  comment: string
  /** モデルが選んだ感情。未取得/不正なら undefined（表示側で neutral 等にフォールバック） */
  emotion?: FairyExpression
  /** 収集対象の主役。景色だけ・不鮮明・対象なしなら null */
  subject: IdentifiedSubject | null
}

export interface IdentifyProvider {
  /** 写真から、コレットのひとこと（＋感情）と写っている主役を判定する */
  identify(photo: Blob, opts?: { personaId?: string }): Promise<IdentifyResult>
}
