import { create } from 'zustand'
import type { CollectionEntry } from '../types'
import type { IdentifiedSubject } from '../lib/ai/identifyProvider'
import { collectionRepository } from '../lib/storage/repository'
import { CATEGORY_ORDER } from '../lib/category'

/**
 * 図鑑（Seek 型・実物クロップの収集）の状態。永続化は `collectionRepository` 越し
 * （albumStore に倣う）。同種は speciesKey でまとめ、発見回数を積む（デデュープ）。
 * 図鑑は「窯（アイテム化）の入口」でもあり、集めた実物が妖精界アイテムの素になる。
 */

export type CollectionStatus = 'idle' | 'loading' | 'error'

/** collect の結果。isNew=true なら初発見（呼び出し側で「はじめて見つけた！」演出に使う）。 */
export interface CollectResult {
  entry: CollectionEntry
  isNew: boolean
}

interface CollectionState {
  entries: CollectionEntry[]
  status: CollectionStatus
  error: string | null
  /** 永続層から図鑑を読み込む */
  load: () => Promise<void>
  /** 判定した主役＋クロップ画像を収集する。同種は count+1、新種は新規追加 */
  collect: (subject: IdentifiedSubject, blob: Blob, description: string) => Promise<CollectResult>
  /** 図鑑エントリを削除する */
  remove: (id: string) => Promise<void>
}

/** 図鑑の並び：カテゴリ順 → 初発見が古い順（タイルが動かない安定順）。 */
function sortEntries(entries: CollectionEntry[]): CollectionEntry[] {
  return [...entries].sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category)
    const cb = CATEGORY_ORDER.indexOf(b.category)
    if (ca !== cb) return ca - cb
    return a.firstSeenAt.localeCompare(b.firstSeenAt)
  })
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  entries: [],
  status: 'idle',
  error: null,

  load: async () => {
    set({ status: 'loading', error: null })
    try {
      const entries = await collectionRepository.list()
      set({ entries: sortEntries(entries), status: 'idle' })
    } catch (err) {
      const message = err instanceof Error ? err.message : '図鑑の読み込みに失敗しました'
      set({ status: 'error', error: message })
    }
  },

  collect: async (subject, blob, description) => {
    const now = new Date().toISOString()
    // カメラは図鑑をロードせずに collect しうる。未ロードでも重複を作らないよう、
    // メモリが空なら永続層を基準にデデュープする（データは小さい）。
    const base = get().entries.length > 0 ? get().entries : await collectionRepository.list()
    const existing = base.find((e) => e.speciesKey === subject.speciesKey)

    if (existing) {
      // 同種の再発見：回数と最終発見だけ更新（初回のクロップ画像・解説は保つ）。
      const updated: CollectionEntry = { ...existing, count: existing.count + 1, lastSeenAt: now }
      await collectionRepository.put(updated)
      set({ entries: sortEntries(base.map((e) => (e.id === updated.id ? updated : e))) })
      return { entry: updated, isNew: false }
    }

    const entry: CollectionEntry = {
      id: crypto.randomUUID(),
      speciesKey: subject.speciesKey,
      name: subject.name,
      description,
      category: subject.category,
      rarity: subject.rarity,
      blob,
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    }
    await collectionRepository.put(entry)
    set({ entries: sortEntries([...base, entry]) })
    return { entry, isNew: true }
  },

  remove: async (id) => {
    await collectionRepository.remove(id)
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
  },
}))
