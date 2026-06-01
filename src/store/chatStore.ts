import { create } from 'zustand'
import type { ChatMessage } from '../types'
import { chatProvider } from '../lib/ai/chat'

export type ChatStatus = 'idle' | 'sending' | 'error'

interface ChatState {
  messages: ChatMessage[]
  status: ChatStatus
  error: string | null
  /** ユーザー入力を送り、妖精の応答を履歴に追加する */
  send: (userInput: string, personaId: string) => Promise<void>
  /** 会話をクリア */
  reset: () => void
}

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  error: null,

  send: async (userInput, personaId) => {
    const text = userInput.trim()
    if (!text || get().status === 'sending') return

    // 送信前の履歴を provider に渡す（userInput は別引数で末尾に積まれる）。
    const history = get().messages
    set({ messages: [...history, createMessage('user', text)], status: 'sending', error: null })

    try {
      const reply = await chatProvider.sendMessage(history, text, { personaId })
      set((s) => ({ messages: [...s.messages, createMessage('fairy', reply)], status: 'idle' }))
    } catch (err) {
      const message = err instanceof Error ? err.message : '会話に失敗しました'
      set({ status: 'error', error: message })
    }
  },

  reset: () => set({ messages: [], status: 'idle', error: null }),
}))
