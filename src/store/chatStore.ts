import { create } from 'zustand'
import type { ChatMessage } from '../types'
import { chatProvider } from '../lib/ai/chat'
import { useGaugeStore, GAUGE_PER_CHAT } from './gaugeStore'
import { useAffinityStore, AFFINITY_PER_CHAT } from './affinityStore'
import { useMemoryStore } from './memoryStore'
import { useCollectionStore } from './collectionStore'
import { useAlbumStore } from './albumStore'
import { buildGroundingNotes } from '../lib/grounding'

export type ChatStatus = 'idle' | 'sending' | 'error'

/** 何メッセージ進むごとに記憶を要約するか（＝約3往復。頻度を絞ってコスト/接地を両立）。 */
const CONSOLIDATE_EVERY = 6

interface ChatState {
  messages: ChatMessage[]
  status: ChatStatus
  error: string | null
  /** 返信が来るたびに +1。立ち絵の一発アニメ（animateKey）の発火に使う */
  replyNonce: number
  /** 既に記憶へ反映済みのメッセージ数（セッション内。要約トリガーの基準） */
  consolidatedCount: number
  /** ユーザー入力を送り、妖精の応答を履歴に追加する */
  send: (userInput: string, personaId: string) => Promise<void>
  /** 未反映の会話を今すぐ記憶に要約する（検証用の手動発火） */
  consolidateMemoryNow: () => Promise<void>
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
  consolidatedCount: 0,

  send: async (userInput, personaId) => {
    const text = userInput.trim()
    if (!text || get().status === 'sending') return

    // 送信前の履歴を provider に渡す（userInput は別引数で末尾に積まれる）。
    const history = get().messages
    set({ messages: [...history, createMessage('user', text)], status: 'sending', error: null })

    try {
      // 好感度レベル＋記憶を会話に載せる（サーバの system prompt で口調 tier＋接地に反映）。
      const affinityLevel = useAffinityStore.getState().level()
      const memoryFacts = useMemoryStore.getState().facts

      // 図鑑・アルバムの傾向を接地ノートに（STEP2c）。会話タブ単独起動でも接地できるよう、
      // 未ロードなら読む（データは小さい。collect の「メモリ空なら永続層」idiom と同じ発想）。
      const col = useCollectionStore.getState()
      if (col.entries.length === 0 && col.status === 'idle') await col.load()
      const alb = useAlbumStore.getState()
      if (alb.photos.length === 0 && alb.status === 'idle') await alb.load()
      const groundingNotes = buildGroundingNotes({
        entries: useCollectionStore.getState().entries,
        photos: useAlbumStore.getState().photos,
      })
      if (import.meta.env.DEV) console.debug('[grounding]', groundingNotes)

      const reply = await chatProvider.sendMessage(history, text, {
        personaId,
        affinityLevel,
        memoryFacts,
        groundingNotes,
      })
      set((s) => ({
        messages: [...s.messages, createMessage('fairy', reply.text, reply.emotion)],
        status: 'idle',
        replyNonce: s.replyNonce + 1,
      }))
      // 会話は「安い日常行動」＝まほうパワー＋絆を少し貯める（返事が来たときだけ）。
      // ライフサイクルでなくイベント側で加算し、タブ再マウントでの二重加算を避ける。
      useGaugeStore.getState().add(GAUGE_PER_CHAT)
      useAffinityStore.getState().add(AFFINITY_PER_CHAT)

      // 数往復ごとに記憶を要約（非ブロッキング＝会話は待たせない）。未反映の会話だけ渡す。
      const msgs = get().messages
      if (msgs.length - get().consolidatedCount >= CONSOLIDATE_EVERY) {
        const tail = msgs.slice(get().consolidatedCount)
        set({ consolidatedCount: msgs.length })
        void useMemoryStore.getState().consolidate(tail)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '会話に失敗しました'
      set({ status: 'error', error: message })
    }
  },

  consolidateMemoryNow: async () => {
    const msgs = get().messages
    const tail = msgs.slice(get().consolidatedCount)
    if (tail.length === 0) return
    set({ consolidatedCount: msgs.length })
    await useMemoryStore.getState().consolidate(tail)
  },

  reset: () => set({ messages: [], status: 'idle', error: null, replyNonce: 0, consolidatedCount: 0 }),
}))
