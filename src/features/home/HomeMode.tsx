import { useAppStore } from '../../store/appStore'
import { useChatStore } from '../../store/chatStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import ChatPanel from './ChatPanel'

/**
 * ホームモード。
 * 妖精を中央上に表示し、その下で会話する（STEP2）。図鑑（STEP4）・妖精の窯（STEP7）は今後追加。
 */
export default function HomeMode() {
  const characterId = useAppStore((s) => s.characterId)
  const status = useChatStore((s) => s.status)
  const messages = useChatStore((s) => s.messages)

  // 会話状態に応じて表情を出し分ける（未配置の表情は neutral にフォールバック）。
  const lastIsFairy = messages.length > 0 && messages[messages.length - 1].role === 'fairy'
  const expression: FairyExpression =
    status === 'sending'
      ? 'thinking'
      : status === 'error'
        ? 'sad'
        : lastIsFairy
          ? 'happy'
          : 'neutral'

  return (
    <div className="flex h-full flex-col items-center gap-4 overflow-y-auto px-6 py-6 text-center">
      <Sprite2DRenderer characterId={characterId} expression={expression} size="lg" />
      <ChatPanel />
    </div>
  )
}
