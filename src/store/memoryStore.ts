import { create } from 'zustand'
import type { ChatMessage, MemoryFact } from '../types'
import { memoryProvider } from '../lib/ai/memory'

/**
 * コレットの記憶（v2・STEP2b）＝「きみについての短い事実」の生きたリスト。
 * 会話が数往復進むと安価な要約1回で更新し、会話のたびに system prompt へ注入する
 * （＝名前で呼ぶ・話題を覚えてる）。永続は gauge/affinity と同じ localStorage
 * （関係データなので本来クラウド寄り。STEP6 で Supabase＋エクスポート/削除の正式化）。
 */

const STORAGE_KEY = 'anycollect.memory.v1'
const MAX_FACTS = 12

function isFact(v: unknown): v is MemoryFact {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.key === 'string' && typeof r.value === 'string'
}

function readInitial(): MemoryFact[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isFact).slice(0, MAX_FACTS)
  } catch {
    return []
  }
}

function persist(facts: MemoryFact[]): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(facts))
  } catch {
    // 保存に失敗しても記憶自体は動く（永続だけ諦める）。
  }
}

interface MemoryState {
  facts: MemoryFact[]
  /** 要約中フラグ（再入防止＋UI表示に使える） */
  consolidating: boolean
  /** 直近の会話から facts を更新する（再入ガード・失敗は握りつぶして会話を止めない） */
  consolidate: (messages: ChatMessage[]) => Promise<void>
  /** 記憶を消す（削除。spec「削除を一級」の芽・検証にも使う） */
  forget: () => void
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  facts: readInitial(),
  consolidating: false,

  consolidate: async (messages) => {
    if (get().consolidating) return
    // ユーザー発話が無ければ覚えることは無い（無駄な API 呼び出しを避ける）。
    if (!messages.some((m) => m.role === 'user' && m.content.trim())) return
    set({ consolidating: true })
    try {
      const updated = await memoryProvider.consolidate(messages, get().facts)
      persist(updated)
      set({ facts: updated })
    } catch {
      // 記憶更新の失敗は会話を止めない（次の機会に再挑戦）。
    } finally {
      set({ consolidating: false })
    }
  },

  forget: () => {
    persist([])
    set({ facts: [] })
  },
}))
