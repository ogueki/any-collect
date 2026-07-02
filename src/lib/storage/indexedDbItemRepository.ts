import type { Item, Synthesis } from '../../types'
import type { ItemRepository } from './itemRepository'
import {
  ITEMS_STORE,
  SYNTHESES_STORE,
  requestToPromise,
  withStore,
} from './indexedDb'

/**
 * `ItemRepository` の IndexedDB 実装（STEP4a）。
 * 端末ローカルに図鑑（アイテム）を永続化する。DB の open / version 管理・共通
 * ヘルパは `indexedDb.ts` に集約（photos と同一 DB を共有するため）。
 * Supabase 実装は STEP6 で追加し、`repository.ts` の差し替え1点で切り替える。
 */

export const indexedDbItemRepository: ItemRepository = {
  async list() {
    const items = await withStore(ITEMS_STORE, 'readonly', (store) =>
      requestToPromise(store.getAll() as IDBRequest<Item[]>),
    )
    // 新しい順（取得日時の降順）に並べて返す。
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async get(id) {
    const item = await withStore(ITEMS_STORE, 'readonly', (store) =>
      requestToPromise(store.get(id) as IDBRequest<Item | undefined>),
    )
    return item ?? null
  },

  async add(item) {
    const full: Item = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    await withStore(ITEMS_STORE, 'readwrite', (store) => requestToPromise(store.add(full)))
    return full
  },

  async update(id, patch) {
    // 1トランザクション内で get → put（妖精界の配置更新などの部分更新用）。
    return withStore(ITEMS_STORE, 'readwrite', async (store) => {
      const current = await requestToPromise(store.get(id) as IDBRequest<Item | undefined>)
      if (!current) throw new Error('更新対象のアイテムが見つかりません')
      // id / createdAt は不変に保つ（patch からの上書きを防ぐ）。
      const next: Item = { ...current, ...patch, id: current.id, createdAt: current.createdAt }
      await requestToPromise(store.put(next))
      return next
    })
  },

  async remove(id) {
    await withStore(ITEMS_STORE, 'readwrite', (store) => requestToPromise(store.delete(id)))
  },

  async recordSynthesis(s) {
    const full: Synthesis = {
      ...s,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    await withStore(SYNTHESES_STORE, 'readwrite', (store) => requestToPromise(store.add(full)))
    return full
  },
}
