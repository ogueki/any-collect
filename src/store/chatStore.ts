import { create } from 'zustand'
import type { ChatMessage } from '../types'
import { chatProvider } from '../lib/ai/chat'
import { useGaugeStore, GAUGE_PER_CHAT, GAUGE_MAX } from './gaugeStore'
import { useAffinityStore, AFFINITY_PER_CHAT } from './affinityStore'
import { useMemoryStore } from './memoryStore'
import { useCollectionStore } from './collectionStore'
import { useAlbumStore } from './albumStore'
import { buildGroundingNotes } from '../lib/grounding'

export type ChatStatus = 'idle' | 'sending' | 'error'

/** 何メッセージ進むごとに記憶を要約するか（＝約3往復。頻度を絞ってコスト/接地を両立）。 */
const CONSOLIDATE_EVERY = 6

/** 現地時刻→時間帯ラベル（サーバ側 allowlist と対応。会話の接地・挨拶に使う）。 */
export function timeOfDayLabel(hour: number): string {
  if (hour <= 4) return '深夜'
  if (hour <= 10) return '朝'
  if (hour <= 15) return '昼'
  if (hour <= 18) return '夕方'
  return '夜'
}

/** 会話に載せる接地文脈（好感度・記憶・図鑑/アルバム傾向・時間帯）を集める。send/opening 共用。 */
async function gatherChatContext() {
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

  return {
    affinityLevel,
    memoryFacts,
    groundingNotes,
    timeOfDay: timeOfDayLabel(new Date().getHours()),
  }
}

interface ChatState {
  messages: ChatMessage[]
  status: ChatStatus
  error: string | null
  /** コレットの第一声を生成中か（送信ブロックはしない・ホームのタイピング表示用） */
  opening: boolean
  /** 第一声をこのセッションで既に要求したか（再マウントでの重複呼び出しガード） */
  openingRequested: boolean
  /** 返信が来るたびに +1。立ち絵の一発アニメ（animateKey）の発火に使う */
  replyNonce: number
  /** 既に記憶へ反映済みのメッセージ数（セッション内。要約トリガーの基準） */
  consolidatedCount: number
  /** ユーザー入力を送り、妖精の応答を履歴に追加する */
  send: (userInput: string, personaId: string) => Promise<void>
  /** 会話が空のとき、コレットから第一声を話しかける（セッション1回・失敗は握りつぶし） */
  openConversation: (personaId: string) => Promise<void>
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
  opening: false,
  openingRequested: false,
  replyNonce: 0,
  consolidatedCount: 0,

  send: async (userInput, personaId) => {
    const text = userInput.trim()
    if (!text || get().status === 'sending') return

    // 送信前の履歴を provider に渡す（userInput は別引数で末尾に積まれる）。
    const history = get().messages
    set({ messages: [...history, createMessage('user', text)], status: 'sending', error: null })

    try {
      // 好感度レベル＋記憶＋図鑑/アルバム傾向＋時間帯を会話に載せる（サーバの system prompt で接地）。
      const context = await gatherChatContext()
      const reply = await chatProvider.sendMessage(history, text, {
        personaId,
        ...context,
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

  openConversation: async (personaId) => {
    // 会話が既に始まっている・要求済みなら何もしない（ホーム再マウントごとに叩かない）。
    if (get().openingRequested || get().messages.length > 0 || get().status === 'sending') return
    set({ openingRequested: true, opening: true })

    try {
      const context = await gatherChatContext()
      const gaugeFull = useGaugeStore.getState().value >= GAUGE_MAX
      const reply = await chatProvider.openConversation({ personaId, ...context, gaugeFull })

      // 生成中にユーザーが先に話し始めていたら、第一声は捨てる（会話に割り込まない）。
      if (get().messages.length === 0) {
        set((s) => ({
          messages: [createMessage('fairy', reply.text, reply.emotion)],
          replyNonce: s.replyNonce + 1,
        }))
      }
    } catch {
      // 第一声はベストエフォート＝失敗してもホームの固定挨拶が出るだけ（エラー表示しない）。
    } finally {
      set({ opening: false })
    }
  },

  consolidateMemoryNow: async () => {
    const msgs = get().messages
    const tail = msgs.slice(get().consolidatedCount)
    if (tail.length === 0) return
    set({ consolidatedCount: msgs.length })
    await useMemoryStore.getState().consolidate(tail)
  },

  reset: () =>
    set({
      messages: [],
      status: 'idle',
      error: null,
      opening: false,
      openingRequested: false,
      replyNonce: 0,
      consolidatedCount: 0,
    }),
}))
