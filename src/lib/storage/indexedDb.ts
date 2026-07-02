/**
 * IndexedDB の共有基盤（items / syntheses / photos は同一 DB を使う）。
 * DB のバージョンと object store の作成は必ずここに集約する。複数リポジトリが
 * バラバラの version で開くと VersionError になるため、開く口を1つにするのが肝。
 *
 * IndexedDB 固有の事情（version 管理・トランザクション）はこのファイルに隔離し、
 * 各リポジトリは withStore / requestToPromise だけを使う（Supabase 実装は STEP6 で追加）。
 */

const DB_NAME = 'any-collect'
// v2: photos ストアを追加（items / syntheses は v1 から）。
export const DB_VERSION = 2

export const ITEMS_STORE = 'items'
export const SYNTHESES_STORE = 'syntheses'
export const PHOTOS_STORE = 'photos'

/** DB を開く（必要なら object store を作成）。呼び出しごとに開いて使い捨てる。 */
export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    // 全 store を冪等に作成する（contains チェック）。version を上げた既存 DB でも
    // 未作成の store（photos 等）だけが追加される。
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        db.createObjectStore(ITEMS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(SYNTHESES_STORE)) {
        db.createObjectStore(SYNTHESES_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
        db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB を開けませんでした'))
  })
}

/** IDBRequest を Promise 化する小ヘルパ。 */
export function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作に失敗しました'))
  })
}

/**
 * 1 つの store に対する操作を1トランザクションで実行する。
 * 書き込み系は tx.oncomplete まで待って「確実に永続化された」ことを保証する。
 */
export async function withStore<T>(
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
