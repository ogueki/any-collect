import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useChatStore } from '../../store/chatStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import ChatPanel from './ChatPanel'
import KilnView from '../kiln/KilnView'

type HomeSubView = 'chat' | 'kiln'

export default function HomeMode() {
  const characterId = useAppStore((s) => s.characterId)
  const status = useChatStore((s) => s.status)
  const messages = useChatStore((s) => s.messages)
  const replyNonce = useChatStore((s) => s.replyNonce)
  const { expression: reactionExpression, animateKey, fire } = useFairyReaction()

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
      {/* サブビュー切替 */}
      <div className="flex gap-1 rounded-full bg-white/60 p-1 shadow-pop backdrop-blur">
        <SubViewTab
          label="おしゃべり"
          active={subView === 'chat'}
          onClick={() => setSubView('chat')}
        />
        <SubViewTab
          label="妖精の窯"
          active={subView === 'kiln'}
          onClick={() => setSubView('kiln')}
        />
      </div>

      <Sprite2DRenderer
        characterId={characterId}
        expression={expression}
        size="lg"
        animateKey={animateKey}
      />

      {subView === 'chat' && <ChatPanel />}
      {subView === 'kiln' && <KilnView onReaction={handleKilnReaction} />}
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
      className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
        active ? 'bg-lavender text-white' : 'text-slate-500 hover:bg-lavender/20'
      }`}
    >
      {label}
    </button>
  )
}
