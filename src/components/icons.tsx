import type { ReactNode, SVGProps } from 'react'

/**
 * UI 用の線アイコン（inline SVG）の共通セット。
 * 「絵文字はUIに使わない・線アイコンで統一」（レイアウト再構成の決定）に沿って、
 * 声トグルなどの操作チップを絵文字から置き換える。
 *
 * - `currentColor` 追従＝親の text 色をそのまま継ぐ（ダーク背景でも白などにできる）。
 * - サイズは font-size ではなく className の `h-* w-*` で決める（`text-lg` を廃せる）。
 * - 装飾なので `aria-hidden`。意味はボタン側の `aria-label` が持つ。
 */

type IconProps = SVGProps<SVGSVGElement>

function Base({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

/** 声オン（スピーカー＋音波）。 */
export function SoundOnIcon(props: IconProps) {
  return (
    <Base {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </Base>
  )
}

/** 声オフ（スピーカー＋×）。 */
export function SoundOffIcon(props: IconProps) {
  return (
    <Base {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </Base>
  )
}

/** きらめき（生成・出現の演出用。塗りの4点スパークル）。 */
export function SparkleIcon(props: IconProps) {
  return (
    <Base fill="currentColor" stroke="none" {...props}>
      <path d="M12 2.5l1.6 5.1a3 3 0 0 0 1.8 1.8l5.1 1.6-5.1 1.6a3 3 0 0 0-1.8 1.8L12 19.5l-1.6-5.1a3 3 0 0 0-1.8-1.8L3.5 11l5.1-1.6a3 3 0 0 0 1.8-1.8z" />
    </Base>
  )
}
