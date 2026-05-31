import type { ComponentType } from 'react'

/** 妖精の表情。差分イラストの切り替えに対応 */
export type FairyExpression =
  | 'neutral'
  | 'happy'
  | 'surprised'
  | 'thinking'
  | 'sad'

export interface FairyViewProps {
  /** 表示するキャラ ID（characters/<id>/） */
  characterId: string
  expression: FairyExpression
  /** sm = カメラモード右下 / lg = ホームモード中央 */
  size?: 'sm' | 'lg'
}

/**
 * 妖精表示の抽象。現行は 2D スプライト実装（STEP1）。
 * 将来 Live2D / 3D-VRM 実装を同じ Props で差し替え可能にする。
 */
export type CharacterRenderer = ComponentType<FairyViewProps>
