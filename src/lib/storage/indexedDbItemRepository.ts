import type { Item, Synthesis } from '../../types'
import type { ItemRepository } from './itemRepository'

/**
 * `ItemRepository` の IndexedDB 実装（STEP4a）。
 * 端末ローカルに図鑑を永続化する。Supabase 実装は STEP9 で追加し、
 * `repository.ts` の差し替え1点で切り替える（IF・呼び出し側は無改修）。
 *
 * 依存追加はせず、必要最小限の promisified ヘルパだけをこのファイル内に持つ。
 * IndexedDB 固有の事情（version 管理・トランザクション）はここに隔離する。
 */

const DB_NAME = 'any-collect'
// items / syntheses を初回 upgrade でまとめて作成し、STEP8（合成）で version を上げずに済むようにする。
const DB_VERSION = 1
const ITEMS_STORE = 'items'
const SYNTHESES_STORE = 'syntheses'

/** DB を開く（必要なら object store を作成）。呼び出しごとに開いて使い捨てる。 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        db.createObjectStore(ITEMS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(SYNTHESES_STORE)) {
        db.createObjectStore(SYNTHESES_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB を開けませんでした'))
  })
}

/** IDBRequest を Promise 化する小ヘルパ。 */
function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作に失敗しました'))
  })
}

/**
 * 1 つの store に対する操作を1トランザクションで実行する。
 * 書き込み系は tx.oncomplete まで待って「確実に永続化された」ことを保証する。
 */
async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const store = tx.objectStore(storeName)
      let result: T
      fn(store).then(
        (value) => {
          result = value
        },
        (err) => reject(err),
      )
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error ?? new Error('トランザクションに失敗しました'))
      tx.onabort = () => reject(tx.error ?? new Error('トランザクションが中断されました'))
    })
  } finally {
    db.close()
  }
}

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
