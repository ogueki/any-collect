import { useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { useChatStore } from '../../store/chatStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import ChatPanel from './ChatPanel'

/**
 * ホームモード。
 * 妖精を中央上に表示し、その下で会話する（STEP2）。図鑑（STEP4）・妖精の窯（STEP8）は今後追加。
 */
export default function HomeMode() {
  const characterId = useAppStore((s) => s.characterId)
  const status = useChatStore((s) => s.status)
  const messages = useChatStore((s) => s.messages)
  const replyNonce = useChatStore((s) => s.replyNonce)
  const { expression: reactionExpression, animateKey, fire } = useFairyReaction()

  // 直近の妖精メッセージ（sustained なベース表情に使う）。
  const lastFairy = [...messages].reverse().find((m) => m.role === 'fairy')
  const lastFairyEmotion = lastFairy?.emotion

  // 新着返事のたびに一発リアクションを発火（フックが animateKey を進めてアニメを再生）。
  // 合図は replyNonce の増加。lastFairyEmotion はそれに同期して変わる。
  useEffect(() => {
    if (!replyNonce || !lastFairyEmotion) return
    fire(lastFairyEmotion)
  }, [replyNonce, lastFairyEmotion, fire])

  // ベース表情（sustained）：エラー時のみ sad、それ以外は直近の妖精 emotion を保持。
  // 送信中はあえて表情を変えない（毎回「考えポーズ」を挟むとテンポが悪い。考え中の合図は
  // ChatPanel のテキストで出している）。リアクション発火中はフックの表情で一時上書きされる。
  const baseExpression: FairyExpression =
    status === 'error' ? 'sad' : (lastFairyEmotion ?? (lastFairy ? 'happy' : 'neutral'))
  const expression = reactionExpression ?? baseExpression

  return (
    <div className="flex h-full flex-col items-center gap-4 overflow-y-auto px-6 py-6 text-center">
      <Sprite2DRenderer
        characterId={characterId}
        expression={expression}
        size="lg"
        animateKey={animateKey}
      />
      <ChatPanel />
    </div>
  )
}
