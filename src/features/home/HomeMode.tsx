import { useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { useChatStore } from '../../store/chatStore'
import { useGaugeStore, GAUGE_MAX } from '../../store/gaugeStore'
import { useAffinityStore, levelForScore, MAX_LEVEL } from '../../store/affinityStore'
import { useMemoryStore } from '../../store/memoryStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import { primeAudio } from '../../lib/audio/useSpeak'
import {
  SoundOnIcon,
  SoundOffIcon,
  CameraIcon,
  HeartIcon,
  SparkleIcon,
  BookIcon,
  GlobeIcon,
  GridIcon,
} from '../../components/icons'
import type { MemoryFact } from '../../types'
import ChatPanel from './ChatPanel'

/**
 * ホーム（新IA・リデザイン）。会話が主役＝コレットの最新の一言を中央に大きく見せる。
 * 上部＝状態を SELF 風の一本バー（なつき＋まほうパワー）に集約。あいさつで名前を呼ぶ（記憶の見せ場）。
 * 下部の入口＝図鑑・妖精界・メニュー、左上でカメラへ切替。会話ログは控えめ（ChatPanel 側で折りたたみ）。
 */

/** 記憶ファクトから「呼び名」を拾う（あれば挨拶で名前を呼ぶ）。 */
const NAME_KEY = /呼び名|名前|なまえ|ニックネーム/
function nameFromFacts(facts: MemoryFact[]): string | null {
  const v = facts.find((f) => NAME_KEY.test(f.key))?.value?.trim()
  return v ? v : null
}

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
  const facts = useMemoryStore((s) => s.facts)
  const { expression: reactionExpression, animateKey, fire } = useFairyReaction()

  const gaugePct = Math.min(100, Math.round((gaugeValue / GAUGE_MAX) * 100))
  const gaugeFull = gaugeValue >= GAUGE_MAX
  const affinityLevel = levelForScore(affinityScore)
  const sending = status === 'sending'
  const name = nameFromFacts(facts)

  // 会話の最新：直近のコレットの返事＝大セリフ、その直前のユーザー発話＝薄く上に残す。
  const lastFairyIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'fairy') return i
    return -1
  })()
  const heroFairy = lastFairyIdx >= 0 ? messages[lastFairyIdx] : null
  const lastFairyEmotion = heroFairy?.emotion
  const prevUser = (() => {
    const upto = sending ? messages.length : lastFairyIdx >= 0 ? lastFairyIdx : messages.length
    for (let i = upto - 1; i >= 0; i--) if (messages[i].role === 'user') return messages[i]
    return null
  })()

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
    status === 'error' ? 'sad' : (lastFairyEmotion ?? (heroFairy ? 'happy' : 'neutral'))
  const expression = reactionExpression ?? baseExpression

  return (
    <div className="flex h-full flex-col items-center gap-4 overflow-y-auto px-6 py-6 text-center">
      {/* 上段：カメラへ切替（左）＋声（右）。位置は作業画面と揃える。 */}
      <div className="flex w-full max-w-xs shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={() => go('camera')}
          className="flex items-center gap-1.5 rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-500 shadow-pop transition active:scale-95"
        >
          <CameraIcon className="h-4 w-4" />
          カメラ
        </button>
        <button
          type="button"
          onClick={() => {
            if (!voiceEnabled) primeAudio()
            toggleVoice()
          }}
          aria-label={voiceEnabled ? '声をオフにする' : '声をオンにする'}
          className="rounded-full bg-white/80 p-2 text-slate-500 shadow-pop transition active:scale-95"
        >
          {voiceEnabled ? <SoundOnIcon className="h-5 w-5" /> : <SoundOffIcon className="h-5 w-5" />}
        </button>
      </div>

      {/* 状態を一本バーに：なつき（左）＋まほうパワー（右）。
          TODO(verify): なつき＝タップでLv循環／まほうパワー＝タップで満タン。リリース前に外す。 */}
      <div className="flex w-full max-w-xs shrink-0 items-center gap-3 rounded-2xl bg-white px-3.5 py-2.5 shadow-pop">
        <button
          type="button"
          onClick={() => (affinityLevel >= MAX_LEVEL ? resetAffinity() : bumpAffinity())}
          className="flex shrink-0 items-center gap-1.5 transition active:scale-95"
          aria-label="なつき度"
        >
          <HeartIcon className="h-5 w-5 text-rose-400" />
          <span className="text-sm font-extrabold text-rose-400">Lv.{affinityLevel}</span>
          <span className="flex gap-1">
            {Array.from({ length: MAX_LEVEL }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i < affinityLevel ? 'bg-rose-400' : 'bg-rose-200'}`}
              />
            ))}
          </span>
        </button>
        <span className="h-6 w-px shrink-0 bg-slate-100" />
        <button
          type="button"
          onClick={() => addGauge(GAUGE_MAX)}
          className="min-w-0 flex-1 text-left transition active:scale-95"
          aria-label="まほうパワー"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1 text-xs font-extrabold text-emerald-600">
              <SparkleIcon className="h-3.5 w-3.5 text-mint" />
              まほうパワー
            </span>
            <span className="text-xs font-extrabold text-emerald-600">
              {gaugeFull ? '満タン！' : `${gaugePct}%`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${gaugeFull ? 'bg-mint' : 'bg-lavender'}`}
              style={{ width: `${gaugePct}%` }}
            />
          </div>
        </button>
      </div>

      {pendingLevelUp && (
        <p className="shrink-0 animate-reveal rounded-full bg-rose-400/90 px-4 py-1 text-xs font-bold text-white shadow-pop">
          コレットとなかよくなった！（なつき Lv.{pendingLevelUp}）
        </p>
      )}

      {/* ヒーロー：直前の発話（薄く）＋コレットの大セリフ＋立ち絵 */}
      <div className="flex w-full max-w-xs shrink-0 flex-col items-center">
        {prevUser && (
          <div className="mb-1.5 max-w-[80%] self-end truncate rounded-2xl rounded-br-sm bg-lavender/50 px-3 py-1 text-xs font-bold text-white">
            {prevUser.content}
          </div>
        )}
        <div className="relative w-full rounded-3xl bg-white px-5 py-4 shadow-pop">
          {sending ? (
            <span className="flex justify-center gap-1.5 py-1">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="h-2 w-2 animate-bounce rounded-full bg-slate-300"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </span>
          ) : heroFairy ? (
            <p className="text-lg font-bold leading-relaxed text-slate-700">{heroFairy.content}</p>
          ) : (
            <p className="text-lg font-bold leading-relaxed text-slate-700">
              {name && <span className="text-violet-500">{name}</span>}
              {name ? '、おかえりっ！' : 'おかえりっ！'}{' '}
              {gaugeFull
                ? 'まほうパワー満タンだよ。ずかんの子、召喚してみない？'
                : 'きょうは何を見つけた？'}
            </p>
          )}
        </div>
        {/* 吹き出しのしっぽ */}
        <div className="h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-white" />

        <Sprite2DRenderer
          characterId={characterId}
          expression={expression}
          size="lg"
          animateKey={animateKey}
          level={affinityLevel}
        />
      </div>

      {/* 入口：図鑑・妖精界・メニュー（カメラは上の切替に昇格） */}
      <div className="flex w-full max-w-xs shrink-0 justify-between gap-2">
        <EntryButton
          label="ずかん"
          icon={<BookIcon className="h-6 w-6" />}
          onClick={() => go('collection')}
          highlight={gaugeFull}
        />
        <EntryButton label="妖精界" icon={<GlobeIcon className="h-6 w-6" />} onClick={() => go('realm')} />
        <EntryButton label="メニュー" icon={<GridIcon className="h-6 w-6" />} onClick={openMenu} />
      </div>

      <ChatPanel />
    </div>
  )
}

function EntryButton({
  label,
  icon,
  onClick,
  highlight = false,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-1 flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-bold shadow-pop transition active:scale-95 ${
        highlight ? 'bg-mint text-slate-900 ring-2 ring-mint' : 'bg-white/80 text-slate-600'
      }`}
    >
      {highlight && (
        <span className="absolute -top-1.5 right-1 rounded-full bg-mint px-2 py-0.5 text-[9px] font-extrabold text-emerald-900 shadow-pop">
          召喚できる
        </span>
      )}
      {icon}
      {label}
    </button>
  )
}
