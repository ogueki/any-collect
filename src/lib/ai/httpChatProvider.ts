import type { ChatProvider } from './chatProvider'
import { FAIRY_EXPRESSIONS, type FairyExpression } from '../character/CharacterRenderer'

/**
 * /api/chat プロキシ経由で会話する ChatProvider 実装。
 * どのモデル（Gemini / 将来 Claude）を使うかはサーバ側 (api/chat.ts) の責務であり、
 * クライアントはモデルを一切知らない（claude.md 原則1・2）。
 */

interface ChatApiResponse {
  reply?: string
  emotion?: string
  error?: string
}

/** API が返した emotion を既知の表情だけに絞る（不正/欠落は undefined）。 */
function toFairyExpression(value: unknown): FairyExpression | undefined {
  return typeof value === 'string' && (FAIRY_EXPRESSIONS as readonly string[]).includes(value)
    ? (value as FairyExpression)
    : undefined
}

export const httpChatProvider: ChatProvider = {
  async sendMessage(history, userInput, opts) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history: history.map((m) => ({ role: m.role, content: m.content })),
        userInput,
        personaId: opts?.personaId ?? 'default',
        affinityLevel: opts?.affinityLevel,
        memoryFacts: opts?.memoryFacts,
        groundingNotes: opts?.groundingNotes,
      }),
    })

    const data: ChatApiResponse = await res.json().catch(() => ({}))
    if (!res.ok || !data.reply) {
      throw new Error(data.error ?? `会話に失敗しました (${res.status})`)
    }
    return { text: data.reply, emotion: toFairyExpression(data.emotion) }
  },
}
