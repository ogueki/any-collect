import { useEffect, useMemo, useRef, useState } from 'react'
import Sprite2DRenderer from '../lib/character/Sprite2DRenderer'
import { getStatusStages, getTips, type WaitContext } from '../lib/character/waitLines'

/**
 * 生成待ちの全画面オーバーレイ（鑑定中／合成中）。妖精＋状況ステータス＋進捗バー＋豆知識で
 * 待ち時間の体感を改善する。スキャン（カメラ）と STEP8 の合成で使い回す共有UI。
 *
 * 進捗は実シグナルが無い（Gemini/fal は途中経過を返さない）ため、経過時間の漸近カーブ
 * （1 − e^(−t/τ)）で MAX_PROGRESS まで“それっぽく”伸ばす。完了前に満タンにせず・常に動くので
 * 「90%で固まる／一瞬で100%」のような嘘っぽさを避けつつ、所要時間のブレ（~2〜13s）にも追従する。
 */

interface GeneratingOverlayProps {
  characterId: string
  /** 待ちの種類（コピー切替）。既定は鑑定中。STEP8 で 'synthesizing' を追加予定。 */
  context?: WaitContext
}

const TAU_MS = 4000
const MAX_PROGRESS = 0.95
const TIP_INTERVAL_MS = 2600

export default function GeneratingOverlay({
  characterId,
  context = 'searching',
}: GeneratingOverlayProps) {
  const stages = useMemo(() => getStatusStages(context), [context])
  const tips = useMemo(() => getTips(characterId, context), [characterId, context])

  const [progress, setProgress] = useState(0)
  const [tipIdx, setTipIdx] = useState(() => Math.floor(Math.random() * tips.length))
  const startRef = useRef(Date.now())

  // 経過時間ベースの漸近プログレス。
  useEffect(() => {
    startRef.current = Date.now()
    setProgress(0)
    const timer = setInterval(() => {
      const elapsed = Date.now() - startRef.current
      setProgress(Math.min(MAX_PROGRESS, 1 - Math.exp(-elapsed / TAU_MS)))
    }, 80)
    return () => clearInterval(timer)
  }, [])

  // 豆知識のローテーション。
  useEffect(() => {
    const timer = setInterval(() => {
      setTipIdx((i) => (i + 1) % tips.length)
    }, TIP_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [tips])

  // 進捗に応じた状況ステータス（前半→中盤→終盤）。
  const stage = stages[Math.min(stages.length - 1, Math.floor(progress * stages.length))]

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/70 px-6 backdrop-blur-sm">
      <div className="relative flex items-center justify-center">
        {/* 鑑定の魔法グロー（じんわり明滅） */}
        <span
          className="absolute h-36 w-36 rounded-full bg-mint/30 blur-2xl animate-pulse"
          aria-hidden
        />
        <Sprite2DRenderer characterId={characterId} expression="searching" size="lg" />
      </div>

      {/* 状況ステータス */}
      <p className="font-display text-sm tracking-[0.3em] text-mint">{stage}</p>

      {/* 進捗バー（経過時間ベースの推定・完了前は満タンにしない） */}
      <div
        className="h-2 w-56 max-w-[70vw] overflow-hidden rounded-full bg-white/20"
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="生成の進捗"
      >
        <div
          className="h-full rounded-full bg-mint transition-[width] duration-100 ease-out"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* コレットの豆知識（数秒ごとに切替・key で入場アニメを再生） */}
      <p
        key={tipIdx}
        className="animate-pop max-w-[18rem] text-center text-sm leading-relaxed text-white/90"
      >
        {tips[tipIdx]}
      </p>
    </div>
  )
}
