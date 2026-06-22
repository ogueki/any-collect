import type { ComponentType } from 'react'

/**
 * 妖精の表情の単一ソース。差分イラスト・CSSアニメ・リアクション判定は
 * すべてこの配列を基準にする。新しい感情の追加はここに 1 行足し、
 * `src/characters/<id>/sprites/<emotion>/` にイラストを置くだけで完結する。
 */
export const FAIRY_EXPRESSIONS = [
  'neutral',
  'happy',
  'surprised',
  'thinking',
  'sad',
  'excited',
  'shy',
  'confused',
  'exasperated',
  'angry',
  'salute',
  'searching',
] as const

/** 妖精の表情。差分イラストの切り替えに対応 */
export type FairyExpression = (typeof FAIRY_EXPRESSIONS)[number]

export interface FairyViewProps {
  /** 表示するキャラ ID（characters/<id>/） */
  characterId: string
  expression: FairyExpression
  /** sm = カメラモード右下 / lg = ホームモード中央 */
  size?: 'sm' | 'lg'
  /**
   * リアクション発火ごとに変わる任意の値。変わるたびに
   * ①スプライトをランダムに引き直し ②一発アニメをリスタートする。
   * 未指定なら expression の変化に追従する従来挙動。
   */
  animateKey?: number
  /**
   * 好感度レベル（1 始まり、既定 1）。同じ感情でも `sprites/<emotion>/lv{level}/`
   * を優先参照し、無ければ下位レベル→tierなし素材へフォールバックする。
   * この値の「源」（収集数や専用スコア）は呼び出し側で決め、表示側は数値だけ受け取る。
   */
  level?: number
}

/**
 * 妖精表示の抽象。現行は 2D スプライト実装（STEP1）。
 * 将来 Live2D / 3D-VRM 実装を同じ Props で差し替え可能にする。
 */
export type CharacterRenderer = ComponentType<FairyViewProps>
