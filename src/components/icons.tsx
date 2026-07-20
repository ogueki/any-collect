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

/** ハート（なつき度・塗り）。 */
export function HeartIcon(props: IconProps) {
  return (
    <Base fill="currentColor" stroke="none" {...props}>
      <path d="M12 20s-7-4.4-9.3-8.3A5 5 0 0 1 12 6.2 5 5 0 0 1 21.3 11.7C19 15.6 12 20 12 20z" />
    </Base>
  )
}

/** 図鑑（本）。 */
export function BookIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
    </Base>
  )
}

/** たからばこ（宝箱＝ふた付きの箱）。 */
export function TreasureBoxIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 10.5A2.5 2.5 0 0 1 5.5 8h13A2.5 2.5 0 0 1 21 10.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8.5z" />
      <path d="M3 8.5 5 4h14l2 4.5" />
      <path d="M3 12.5h18" />
      <path d="M10.5 12.5h3v3h-3z" />
    </Base>
  )
}

/** メニュー（2×2 グリッド）。 */
export function GridIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </Base>
  )
}

/** 送信（紙飛行機）。 */
export function SendIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4z" />
    </Base>
  )
}

/** カメラ。 */
export function CameraIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </Base>
  )
}
