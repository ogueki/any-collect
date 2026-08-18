import { useEffect, useMemo, useRef, useState } from 'react'
import Sprite2DRenderer from '../lib/character/Sprite2DRenderer'
import { getStatusStages, getTips, type WaitContext } from '../lib/character/waitLines'

/**
 * 生成待ちの全画面オーバーレイ（召喚中／合成中）。召喚（図鑑）と窯（合成）で使い回す共有UI。
 *
 * **ここが"儀式"の本体**（実機FB 2026-08-10）。完成後に花火を足すより、
 * **待たされている ~7 秒**を魔法にする方が効く。前は「妖精＋進捗バー＋豆知識」で、
 * *ソフトウェアの待ち画面の語彙*だった。
 *
 * ・**進捗バーを捨てずに「魔法陣の光の輪」へ置き換える**＝情報（あとどれくらい）は残し、
 *   表現だけ魔法にする。所要時間のブレ（~2〜13s）に追従する必要があるので進捗自体は要る。
 * ・**光が外から中心へ流れ続ける**＝"溜め"が見える。進捗が進むほど密度と明るさが上がる。
 * ・**完成の瞬間は結果カードが直接受ける。** ここと結果の間に別の出現演出を挟んでいた時期が
 *   あるが、**同じ「光が集まって弾ける」を2回見せる**ことになるので不採用にした
 *   （2026-08-12・DECISIONS）。溜めの payoff は「アイテムそのものが出ること」で足りる。
 * ・画像アセットは使わない（CSS のみ＝たからばこの背景と同じ方針）。
 *
 * 進捗は実シグナルが無い（Gemini/fal は途中経過を返さない）ため、経過時間の漸近カーブ
 * （1 − e^(−t/τ)）で MAX_PROGRESS まで“それっぽく”伸ばす。完了前に満タンにせず・常に動くので
 * 「90%で固まる／一瞬で100%」のような嘘っぽさを避けつつ、所要時間のブレにも追従する。
 */

interface GeneratingOverlayProps {
  characterId: string
  /** 待ちの種類（コピー切替）。既定は召喚。 */
  context?: WaitContext
}

const TAU_MS = 4000
const MAX_PROGRESS = 0.95
const TIP_INTERVAL_MS = 2600

/** 集まり続ける光の粒。多いと重いので、進捗で"見える数"を増やす。 */
const PULL_MOTES = 14
/** 進捗リングの半径（px・SVG 内部座標）。 */
const RING_R = 54

/** 演出の地（たからばこと同じ世界観の紫）。 */
const STAGE_BG =
  'radial-gradient(90% 60% at 50% 45%, rgba(76,29,149,0.72) 0%, rgba(30,27,75,0.97) 70%),' +
  'linear-gradient(160deg, #1e1b4b 0%, #312e81 45%, #4c1d95 100%)'

export default function GeneratingOverlay({
  characterId,
  context = 'summoning',
}: GeneratingOverlayProps) {
  const stages = useMemo(() => getStatusStages(context), [context])
  const tips = useMemo(() => getTips(characterId, context), [characterId, context])

  const [progress, setProgress] = useState(0)
  const [tipIdx, setTipIdx] = useState(() => Math.floor(Math.random() * tips.length))
  // 開始時刻はマウント時に effect 内で入れる（レンダー中に Date.now() を読むと不純）。
  const startRef = useRef(0)

  // 経過時間ベースの漸近プログレス。
  useEffect(() => {
    startRef.current = Date.now()
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

  // 進捗リング（円周の充填）。バーの代わりに"陣が満ちていく"で見せる。
  const circumference = 2 * Math.PI * RING_R
  // 終盤ほど密度・速さ・明るさが上がる＝「溜まってきた」が伝わる。
  const intensity = Math.min(1, progress / MAX_PROGRESS)
  const visibleMotes = Math.max(4, Math.round(PULL_MOTES * (0.35 + 0.65 * intensity)))
  const pullDuration = 1.9 - 0.8 * intensity

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6"
      style={{ background: STAGE_BG }}
    >
      <div className="relative flex items-center justify-center">
        {/* 外から中心へ流れ続ける光＝"溜め"。進捗で数と速さが上がる。 */}
        {Array.from({ length: visibleMotes }, (_, i) => (
          <span
            key={`pull-${i}`}
            aria-hidden
            className="absolute h-[6px] w-[6px] animate-summon-pull rounded-full bg-white"
            style={{
              ['--a' as string]: `${(360 / visibleMotes) * i}deg`,
              animationDuration: `${pullDuration}s`,
              animationDelay: `${-(i * pullDuration) / visibleMotes}s`,
              boxShadow: `0 0 ${6 + 6 * intensity}px ${2 + 2 * intensity}px rgba(196,181,253,0.9)`,
            }}
          />
        ))}

        {/* 魔法陣＝逆回しの二重円。破線と点線で"刻まれた文様"に見せる（画像なし）。 */}
        <span
          aria-hidden
          className="absolute h-64 w-64 animate-spin-slow rounded-full border border-dashed border-violet-200/35"
        />
        <span
          aria-hidden
          className="absolute h-52 w-52 animate-spin-slow-rev rounded-full border border-dotted border-emerald-200/30"
        />

        {/* 中心のグロー。進捗で強くなる＝完成が近いことが色で分かる。 */}
        <span
          aria-hidden
          className="absolute rounded-full blur-2xl"
          style={{
            height: `${9 + 3 * intensity}rem`,
            width: `${9 + 3 * intensity}rem`,
            background: `rgba(${167 + 60 * intensity}, ${243 - 30 * intensity}, ${208 + 40 * intensity}, ${0.25 + 0.25 * intensity})`,
          }}
        />

        {/* 進捗＝陣が満ちる光の輪（旧・進捗バーの置き換え。情報は捨てない）。 */}
        <svg
          className="absolute h-40 w-40 -rotate-90"
          viewBox="0 0 120 120"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="生成の進捗"
        >
          <circle cx="60" cy="60" r={RING_R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
          <circle
            cx="60"
            cy="60"
            r={RING_R}
            fill="none"
            stroke="rgba(196,181,253,0.95)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 120ms linear' }}
          />
        </svg>

        {/* 魔法をかけている姿。召喚も合成（窯）も「魔法をかけている」ので同じポーズを使う
            （分けたくなったら context で出し分ける）。絵が未配置なら neutral に落ちる。 */}
        <Sprite2DRenderer characterId={characterId} expression="casting" size="lg" glow />
      </div>

      {/* 状況ステータス */}
      <p className="font-display text-sm tracking-[0.3em] text-violet-200">{stage}</p>

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
