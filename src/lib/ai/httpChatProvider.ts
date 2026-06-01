import type { ChatProvider } from './chatProvider'

/**
 * /api/chat プロキシ経由で会話する ChatProvider 実装。
 * どのモデル（Gemini / 将来 Claude）を使うかはサーバ側 (api/chat.ts) の責務であり、
 * クライアントはモデルを一切知らない（claude.md 原則1・2）。
 */

interface ChatApiResponse {
  reply?: string
  error?: string
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
      }),
    })

    const data: ChatApiResponse = await res.json().catch(() => ({}))
    if (!res.ok || !data.reply) {
      throw new Error(data.error ?? `会話に失敗しました (${res.status})`)
    }
    return data.reply
  },
}
