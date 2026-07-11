import { useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { useChatStore } from '../../store/chatStore'
import { useGaugeStore, GAUGE_MAX } from '../../store/gaugeStore'
import { useAffinityStore, levelForScore, MAX_LEVEL } from '../../store/affinityStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import { primeAudio } from '../../lib/audio/useSpeak'
import ChatPanel from './ChatPanel'

/**
 * ホーム（新IA）。コレットが中央の主役＝会話がメイン。上部＝状態＋声、
 * 下部の入口＝図鑑・妖精界・メニュー、左上でカメラへ切替。図鑑/アルバム/窯/妖精界は
 * トップレベルの画面（`App`）へ移り、ここではもう描画しない。
 * ※状態バーの一本化・大セリフ・アイコン化・検証ボタンの DEV 限定化は後続スライスで対応。
 */
export default function HomeMode() {
  const characterId = useAppStore((s) => s.characterId)
  const voiceEnabled = useAppStore((s) => s.voiceEnabled)
  const toggleVoice = useAppStore((s) => s.toggleVoice)
  const go = useAppStore((s) => s.go)
  const openMenu = useAppStore((s) => s.openMenu)
  const status = useChatStore((s) => s.status)
  const messages = useChatStore((s) => s.messages)
  const replyNonce = useChatStore((s) => s.replyNonce)
  const gaugeValue = useGaugeStore((s) => s.value)
  const addGauge = useGaugeStore((s) => s.add)
  const affinityScore = useAffinityStore((s) => s.score)
  const pendingLevelUp = useAffinityStore((s) => s.pendingLevelUp)
  const clearLevelUp = useAffinityStore((s) => s.clearLevelUp)
  const bumpAffinity = useAffinityStore((s) => s.bumpLevel)
  const resetAffinity = useAffinityStore((s) => s.reset)
  const { expression: reactionExpression, animateKey, fire } = useFairyReaction()

  const gaugePct = Math.min(100, Math.round((gaugeValue / GAUGE_MAX) * 100))
  const gaugeFull = gaugeValue >= GAUGE_MAX
  const affinityLevel = levelForScore(affinityScore)

  const lastFairy = [...messages].reverse().find((m) => m.role === 'fairy')
  const lastFairyEmotion = lastFairy?.emotion

  useEffect(() => {
    if (!replyNonce || !lastFairyEmotion) return
    fire(lastFairyEmotion)
  }, [replyNonce, lastFairyEmotion, fire])

  // 絆レベルアップ＝コレットが大喜び＋お祝い表示。表示はストアの pendingLevelUp から直接出し、
  // 数秒後に clearLevelUp() で消す（ローカル state を effect 内で同期 set しない）。
  useEffect(() => {
    if (!pendingLevelUp) return
    fire('excited')
    const timer = setTimeout(() => clearLevelUp(), 3500)
    return () => clearTimeout(timer)
  }, [pendingLevelUp, fire, clearLevelUp])

  const baseExpression: FairyExpression =
    status === 'error' ? 'sad' : (lastFairyEmotion ?? (lastFairy ? 'happy' : 'neutral'))
  const expression = reactionExpression ?? baseExpression

  return (
    <div className="flex h-full flex-col items-center gap-4 overflow-y-auto px-6 py-6 text-center">
      {/* 上段：カメラへ切替（左）＋声（右）。位置は作業画面と揃える。 */}
      <div className="flex w-full max-w-xs shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={() => go('camera')}
          className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-500 shadow-pop transition active:scale-95"
        >
          カメラ
        </button>
        <button
          type="button"
          onClick={() => {
            if (!voiceEnabled) primeAudio()
            toggleVoice()
          }}
          aria-label={voiceEnabled ? '声をオフにする' : '声をオンにする'}
          className="rounded-full bg-white/80 px-3 py-2 text-lg shadow-pop transition active:scale-95"
        >
          {voiceEnabled ? '🔊' : '🔇'}
        </button>
      </div>

      {/* まほうパワー（会話・撮影で貯まり、満タンで召喚魔法を解禁）。
          TODO(verify): 検証中はタップで満タンにできるショートカット付き。リリース前に外す。 */}
      <button
        type="button"
        onClick={() => addGauge(GAUGE_MAX)}
        className="w-full max-w-xs shrink-0 text-left"
      >
        <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-500">
          <span>まほうパワー</span>
          <span>{gaugeFull ? '満タン！' : `${gaugePct}%`}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/70">
          <div
            className={`h-full rounded-full transition-all ${gaugeFull ? 'bg-mint' : 'bg-lavender'}`}
            style={{ width: `${gaugePct}%` }}
          />
        </div>
        {gaugeFull ? (
          <p className="mt-1 text-center text-[11px] font-bold text-mint">図鑑から召喚できるよ</p>
        ) : (
          <p className="mt-1 text-center text-[10px] text-slate-400">タップで満タン（検証用）</p>
        )}
      </button>

      {/* コレットとの絆（なつき度）。
          TODO(verify): 検証中はタップで「Lv上げ→MAXならLv1に戻す」を循環。リリース前に外す。 */}
      <button
        type="button"
        onClick={() => (affinityLevel >= MAX_LEVEL ? resetAffinity() : bumpAffinity())}
        className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-rose-400 shadow-pop"
      >
        💗 なつき Lv.{affinityLevel}
        {affinityLevel < MAX_LEVEL ? '（タップで＋・検証用）' : '（タップでLv1へ・検証用）'}
      </button>

      {pendingLevelUp && (
        <p className="shrink-0 animate-reveal rounded-full bg-rose-400/90 px-4 py-1 text-xs font-bold text-white shadow-pop">
          コレットとなかよくなった！（なつき Lv.{pendingLevelUp}）
        </p>
      )}

      <Sprite2DRenderer
        characterId={characterId}
        expression={expression}
        size="lg"
        animateKey={animateKey}
        level={affinityLevel}
      />

      {/* 入口：図鑑・妖精界・メニュー（カメラは上の切替に昇格） */}
      <div className="flex w-full max-w-xs shrink-0 justify-between gap-2">
        <EntryButton label="ずかん" onClick={() => go('collection')} highlight={gaugeFull} />
        <EntryButton label="妖精界" onClick={() => go('realm')} />
        <EntryButton label="メニュー" onClick={openMenu} />
      </div>

      <ChatPanel />
    </div>
  )
}

function EntryButton({
  label,
  onClick,
  highlight = false,
}: {
  label: string
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-2xl px-2 py-3 text-xs font-bold shadow-pop transition active:scale-95 ${
        highlight ? 'bg-mint text-slate-900 ring-2 ring-mint' : 'bg-white/80 text-slate-600'
      }`}
    >
      {label}
      {highlight && <span className="mt-0.5 block text-[10px] font-bold text-emerald-700">召喚できる</span>}
    </button>
  )
}
