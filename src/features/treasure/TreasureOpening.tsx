import { useEffect, useState } from 'react'
import { transitionUrl } from '../../lib/character/transition'

/**
 * たからばこを開ける演出（STEP5・実機フィードバック 2026-07-21）。
 * 宝箱に潜り込むコレットの一枚絵を出し、ズームインしながらフェードして中の空間へ入る。
 * "待ち時間"でなく"儀式"に見せるのが狙い（spec §14 の「1日1個の儀式感」と同じ路線）。
 *
 * ・タップでスキップできる（毎回きっちり待たされない）。
 * ・絵が未配置なら即 onDone（＝演出なしで通常表示に落ちる）。
 * ・毎回出す／セッション初回だけにする、の切替は呼び出し側の判断（今は毎回）。
 */

/** 絵を見せている時間（ms）。 */
const HOLD_MS = 900
/** 中の空間へ抜けるフェードの長さ（ms）。 */
const FADE_MS = 420

export default function TreasureOpening({
  characterId,
  onDone,
}: {
  characterId: string
  onDone: () => void
}) {
  const src = transitionUrl(characterId, 'treasure-open')
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!src) {
      onDone() // 絵が無ければ演出しない
      return
    }
    const hold = setTimeout(() => setLeaving(true), HOLD_MS)
    const done = setTimeout(onDone, HOLD_MS + FADE_MS)
    return () => {
      clearTimeout(hold)
      clearTimeout(done)
    }
  }, [src, onDone])

  if (!src) return null

  return (
    <div
      onPointerDown={onDone} // タップでスキップ
      className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden transition-opacity ease-out"
      style={{
        opacity: leaving ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
        background:
          'radial-gradient(90% 60% at 50% 45%, rgba(76,29,149,0.65) 0%, rgba(30,27,75,0.98) 70%),' +
          'linear-gradient(160deg, #1e1b4b 0%, #312e81 45%, #4c1d95 100%)',
      }}
    >
      {/* 外＝抜ける瞬間の寄り（箱に飛び込む）／内＝登場のポップ（既存の reveal を再利用）。
          transform を層で分けないと、CSS アニメーションが寄りの transform を上書きする。 */}
      <div
        className="ease-in"
        style={{
          transform: leaving ? 'scale(1.4)' : 'scale(1)',
          transition: `transform ${FADE_MS}ms cubic-bezier(0.32, 0, 0.67, 0)`,
        }}
      >
        <img
          src={src}
          alt="たからばこを開ける"
          draggable={false}
          className="w-4/5 max-w-xs animate-reveal select-none"
          style={{ filter: 'drop-shadow(0 0 30px rgba(196,181,253,0.45))' }}
        />
      </div>
    </div>
  )
}
