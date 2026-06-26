import { create } from 'zustand'
import type { Item } from '../types'
import type { GeneratedItem } from '../lib/ai/imageProvider'
import { itemRepository } from '../lib/storage/repository'

/**
 * 図鑑（収集アイテム）の状態。永続化は `itemRepository` 越し（chatStore に倣う）。
 * 図鑑は単なる保存先ではなく「妖精の記憶素材／絵日記」の土台でもある（製品方針）。
 */

export type CodexStatus = 'idle' | 'loading' | 'error'

interface CodexState {
  items: Item[]
  status: CodexStatus
  error: string | null
  /** 永続層から図鑑を読み込む（新しい順） */
  load: () => Promise<void>
  /** 生成結果を図鑑に登録して保存する。保存済み Item を返す */
  addFromGenerated: (generated: GeneratedItem) => Promise<Item>
  /** そのカテゴリの初取得かどうか（登録前に評価する。リアクション判定用） */
  isNewCategory: (category?: string) => boolean
  /** 合成結果を図鑑に登録し、系譜を記録する。素材は消費しない。保存済み Item を返す */
  addFromSynthesis: (generated: GeneratedItem, parentAId: string, parentBId: string) => Promise<Item>
  /** アイテムを削除する */
  remove: (id: string) => Promise<void>
}

export const useCodexStore = create<CodexState>((set, get) => ({
  items: [],
  status: 'idle',
  error: null,

  load: async () => {
    set({ status: 'loading', error: null })
    try {
      const items = await itemRepository.list()
      set({ items, status: 'idle' })
    } catch (err) {
      const message = err instanceof Error ? err.message : '図鑑の読み込みに失敗しました'
      set({ status: 'error', error: message })
    }
  },

  addFromGenerated: async (generated) => {
    // GeneratedItem(imageUrl) → Item(iconUrl) へマッピングして永続化する。
    const saved = await itemRepository.add({
      name: generated.name,
      description: generated.description,
      category: generated.category,
      rarity: generated.rarity,
      iconUrl: generated.imageUrl,
    })
    // list() と同じ「新しい順」を保つため先頭に積む。
    set((s) => ({ items: [saved, ...s.items] }))
    return saved
  },

  addFromSynthesis: async (generated, parentAId, parentBId) => {
    const saved = await itemRepository.add({
      name: generated.name,
      description: generated.description,
      category: generated.category,
      rarity: generated.rarity,
      iconUrl: generated.imageUrl,
    })
    await itemRepository.recordSynthesis({
      resultItemId: saved.id,
      parentAId,
      parentBId,
    })
    set((s) => ({ items: [saved, ...s.items] }))
    return saved
  },

  isNewCategory: (category) => {
    // カテゴリ未設定は「初取得扱いしない」（無印で大興奮させない）。
    if (!category) return false
    return !get().items.some((it) => it.category === category)
  },

  remove: async (id) => {
    await itemRepository.remove(id)
    set((s) => ({ items: s.items.filter((it) => it.id !== id) }))
  },
}))
