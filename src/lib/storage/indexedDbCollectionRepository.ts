import type { CollectionEntry } from '../../types'
import type { CollectionRepository } from './collectionRepository'
import { COLLECTION_STORE, requestToPromise, withStore } from './indexedDb'

/**
 * `CollectionRepository` の IndexedDB 実装（v2・図鑑）。実物クロップの収集を端末ローカルに
 * 永続化する。画像は Blob のまま保存する（IndexedDB は Blob を直接扱える）。DB の open /
 * version 管理は `indexedDb.ts` に集約（items / photos と同一 DB を共有）。
 */
export const indexedDbCollectionRepository: CollectionRepository = {
  async list() {
    return withStore(COLLECTION_STORE, 'readonly', (store) =>
      requestToPromise(store.getAll() as IDBRequest<CollectionEntry[]>),
    )
  },

  async get(id) {
    const entry = await withStore(COLLECTION_STORE, 'readonly', (store) =>
      requestToPromise(store.get(id) as IDBRequest<CollectionEntry | undefined>),
    )
    return entry ?? null
  },

  async put(entry) {
    // 追加も更新も upsert。id は呼び出し側（collectionStore）が採番済み。
    await withStore(COLLECTION_STORE, 'readwrite', (store) => requestToPromise(store.put(entry)))
    return entry
  },

  async remove(id) {
    await withStore(COLLECTION_STORE, 'readwrite', (store) => requestToPromise(store.delete(id)))
  },
}
