import type { Rarity } from '../types'

/**
 * レア度の表示ラベルと配色。カメラの結果プレビューと図鑑カードで共通利用する
 * （重複定義を避けるため CameraMode から移設）。配色は spec.md のパレットに準拠。
 */

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'コモン',
  uncommon: 'アンコモン',
  rare: 'レア',
  epic: 'エピック',
  legendary: 'レジェンダリー',
}

export const RARITY_CLASS: Record<Rarity, string> = {
  common: 'bg-slate-200 text-slate-600',
  uncommon: 'bg-mint/30 text-emerald-700',
  rare: 'bg-sky-200 text-sky-700',
  epic: 'bg-lavender/40 text-violet-700',
  legendary: 'bg-lemon/60 text-amber-700',
}
