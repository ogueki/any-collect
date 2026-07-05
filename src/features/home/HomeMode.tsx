import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useChatStore } from '../../store/chatStore'
import { useGaugeStore, GAUGE_MAX } from '../../store/gaugeStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import ChatPanel from './ChatPanel'
import KilnView from '../kiln/KilnView'
import AlbumView from '../album/AlbumView'
import CollectionView from '../collection/CollectionView'
import RealmView from '../realm/RealmView'

type HomeSubView = 'chat' | 'collection' | 'album' | 'kiln' | 'realm'

export default function HomeMode() {
  const characterId = useAppStore((s) => s.characterId)
  const status = useChatStore((s) => s.status)
  const messages = useChatStore((s) => s.messages)
  const replyNonce = useChatStore((s) => s.replyNonce)
  const gaugeValue = useGaugeStore((s) => s.value)
  const { expression: reactionExpression, animateKey, fire } = useFairyReaction()

  const gaugePct = Math.min(100, Math.round((gaugeValue / GAUGE_MAX) * 100))
  const gaugeFull = gaugeValue >= GAUGE_MAX

  const [subView, setSubView] = useState<HomeSubView>('chat')

  const lastFairy = [...messages].reverse().find((m) => m.role === 'fairy')
  const lastFairyEmotion = lastFairy?.emotion

  useEffect(() => {
    if (!replyNonce || !lastFairyEmotion) return
    fire(lastFairyEmotion)
  }, [replyNonce, lastFairyEmotion, fire])

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
      {/* コレットの元気ゲージ（会話・撮影で貯まり、満タンで妖精の窯を解禁） */}
      <div className="w-full max-w-xs shrink-0">
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
        {gaugeFull && (
          <p className="mt-1 text-center text-[11px] font-bold text-mint">
            妖精の窯でアイテムにできるよ
          </p>
        )}
      </div>

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
