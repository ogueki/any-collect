import { create } from 'zustand'
import type { ChatMessage } from '../types'
import { chatProvider } from '../lib/ai/chat'
import { useGaugeStore, GAUGE_PER_CHAT } from './gaugeStore'
import { useAffinityStore, AFFINITY_PER_CHAT } from './affinityStore'

export type ChatStatus = 'idle' | 'sending' | 'error'

interface ChatState {
  messages: ChatMessage[]
  status: ChatStatus
  error: string | null
  /** 返信が来るたびに +1。立ち絵の一発アニメ（animateKey）の発火に使う */
  replyNonce: number
  /** ユーザー入力を送り、妖精の応答を履歴に追加する */
  send: (userInput: string, personaId: string) => Promise<void>
  /** 会話をクリア */
  reset: () => void
}

function createMessage(
  role: ChatMessage['role'],
  content: string,
  emotion?: ChatMessage['emotion'],
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    emotion,
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  error: null,
  replyNonce: 0,

  send: async (userInput, personaId) => {
    const text = userInput.trim()
    if (!text || get().status === 'sending') return

    // 送信前の履歴を provider に渡す（userInput は別引数で末尾に積まれる）。
    const history = get().messages
    set({ messages: [...history, createMessage('user', text)], status: 'sending', error: null })

    try {
      // 現在の好感度レベルを会話に載せる（サーバの system prompt で口調 tier に反映）。
      const affinityLevel = useAffinityStore.getState().level()
      const reply = await chatProvider.sendMessage(history, text, { personaId, affinityLevel })
      set((s) => ({
        messages: [...s.messages, createMessage('fairy', reply.text, reply.emotion)],
        status: 'idle',
        replyNonce: s.replyNonce + 1,
      }))
      // 会話は「安い日常行動」＝コレットの元気ゲージ＋絆を少し貯める（返事が来たときだけ）。
      // ライフサイクルでなくイベント側で加算し、タブ再マウントでの二重加算を避ける。
      useGaugeStore.getState().add(GAUGE_PER_CHAT)
      useAffinityStore.getState().add(AFFINITY_PER_CHAT)
    } catch (err) {
      const message = err instanceof Error ? err.message : '会話に失敗しました'
      set({ status: 'error', error: message })
    }
  },

  reset: () => set({ messages: [], status: 'idle', error: null, replyNonce: 0 }),
}))
