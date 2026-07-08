import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useChatStore } from '../../store/chatStore'
import { useGaugeStore, GAUGE_MAX } from '../../store/gaugeStore'
import { useAffinityStore, levelForScore, MAX_LEVEL } from '../../store/affinityStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import { primeAudio } from '../../lib/audio/useSpeak'
import ChatPanel from './ChatPanel'
import KilnView from '../kiln/KilnView'
import AlbumView from '../album/AlbumView'
import CollectionView from '../collection/CollectionView'
import RealmView from '../realm/RealmView'

type HomeSubView = 'chat' | 'collection' | 'album' | 'kiln' | 'realm'

export default function HomeMode() {
  const characterId = useAppStore((s) => s.characterId)
  const voiceEnabled = useAppStore((s) => s.voiceEnabled)
  const toggleVoice = useAppStore((s) => s.toggleVoice)
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

  const [subView, setSubView] = useState<HomeSubView>('chat')

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

  const handleKilnReaction = useCallback(
    (emotion: FairyExpression) => {
      fire(emotion)
    },
    [fire],
  )

  const baseExpression: FairyExpression =
    status === 'error' ? 'sad' : (lastFairyEmotion ?? (lastFairy ? 'happy' : 'neutral'))
  const expression = reactionExpression ?? baseExpression

  return (
    <div className="flex h-full flex-col items-center gap-4 overflow-y-auto px-6 py-6 text-center">
      {/* コレットの元気ゲージ（会話・撮影で貯まり、満タンで妖精の窯を解禁）。
          TODO(verify): 検証中はタップで満タンにできるショートカット付き。リリース前に外す。 */}
      <button
        type="button"
        onClick={() => addGauge(GAUGE_MAX)}
        className="w-full max-w-xs shrink-0 text-left"
      >
        <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-500">
          <span>💛 コレットの元気</span>
          <span>{gaugeFull ? '満タン！' : `${gaugePct}%`}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/70">
          <div
            className={`h-full rounded-full transition-all ${gaugeFull ? 'bg-mint' : 'bg-lavender'}`}
            style={{ width: `${gaugePct}%` }}
          />
        </div>
        {gaugeFull ? (
          <p className="mt-1 text-center text-[11px] font-bold text-mint">
            妖精の窯でアイテムにできるよ
          </p>
        ) : (
          <p className="mt-1 text-center text-[10px] text-slate-400">タップで満タン（検証用）</p>
        )}
      </button>

      {/* コレットとの絆（なつき度）。会話・撮影・アイテム化で少しずつ上がり、口調と立ち絵が砕けていく。
          TODO(verify): 検証中はタップで「Lv上げ→MAXならLv1に戻す」を循環（tier比較用）。リリース前に外す。 */}
      <button
        type="button"
        onClick={() => (affinityLevel >= MAX_LEVEL ? resetAffinity() : bumpAffinity())}
        className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-rose-400 shadow-pop"
      >
        💗 なつき Lv.{affinityLevel}
        {affinityLevel < MAX_LEVEL ? '（タップで＋・検証用）' : '（タップでLv1へ・検証用）'}
      </button>

      {/* 声 ON/OFF（コレットの読み上げ・グローバル設定）。会話は返信の 🔊 タップで再生。 */}
      <button
        type="button"
        onClick={() => {
          // 声をONにするタップ（ユーザー操作）の中でアンロックしておく＝以後の自動読み上げが確実に鳴る。
          if (!voiceEnabled) primeAudio()
          toggleVoice()
        }}
        aria-label={voiceEnabled ? '声をオフにする' : '声をオンにする'}
        className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-slate-500 shadow-pop transition active:scale-95"
      >
        {voiceEnabled ? '🔊 声オン' : '🔇 声オフ'}
      </button>

      {pendingLevelUp && (
        <p className="shrink-0 animate-reveal rounded-full bg-rose-400/90 px-4 py-1 text-xs font-bold text-white shadow-pop">
          コレットとなかよくなった！（なつき Lv.{pendingLevelUp}）
        </p>
      )}

      {/* サブビュー切替（5タブ・狭い画面では横スクロール）。shrink-0＝縦に長い
          サブビューでも flex に高さを潰されない（overflow-x で min-height:0 になる回避）。 */}
      <div className="flex w-full max-w-full shrink-0 justify-start gap-1 overflow-x-auto rounded-full bg-white/60 p-1 shadow-pop backdrop-blur sm:justify-center">
        <SubViewTab
          label="おしゃべり"
          active={subView === 'chat'}
          onClick={() => setSubView('chat')}
        />
        <SubViewTab
          label="ずかん"
          active={subView === 'collection'}
          onClick={() => setSubView('collection')}
        />
        <SubViewTab
          label="アルバム"
          active={subView === 'album'}
          onClick={() => setSubView('album')}
        />
        <SubViewTab
          label="妖精の窯"
          active={subView === 'kiln'}
          onClick={() => setSubView('kiln')}
        />
        <SubViewTab
          label="妖精界"
          active={subView === 'realm'}
          onClick={() => setSubView('realm')}
        />
      </div>

      <Sprite2DRenderer
        characterId={characterId}
        expression={expression}
        size="lg"
        animateKey={animateKey}
        level={affinityLevel}
      />

      {subView === 'chat' && <ChatPanel />}
      {subView === 'collection' && <CollectionView />}
      {subView === 'album' && <AlbumView />}
      {subView === 'kiln' && (
        <KilnView onReaction={handleKilnReaction} onGoRealm={() => setSubView('realm')} />
      )}
      {subView === 'realm' && <RealmView />}
    </div>
  )
}

function SubViewTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${
        active ? 'bg-lavender text-white' : 'text-slate-500 hover:bg-lavender/20'
      }`}
    >
      {label}
    </button>
  )
}
