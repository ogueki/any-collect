import type { Photo } from '../../types'
import type { PhotoRepository } from './photoRepository'
import { PHOTOS_STORE, requestToPromise, withStore } from './indexedDb'

/**
 * `PhotoRepository` の IndexedDB 実装（v2）。アルバム写真を端末ローカルに永続化する。
 * 画像は Blob のまま保存する（IndexedDB は Blob を直接扱える）。DB の open / version
 * 管理は `indexedDb.ts` に集約（items と同一 DB を共有）。
 */
export const indexedDbPhotoRepository: PhotoRepository = {
  async list() {
    const photos = await withStore(PHOTOS_STORE, 'readonly', (store) =>
      requestToPromise(store.getAll() as IDBRequest<Photo[]>),
    )
    return photos.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async get(id) {
    const photo = await withStore(PHOTOS_STORE, 'readonly', (store) =>
      requestToPromise(store.get(id) as IDBRequest<Photo | undefined>),
    )
    return photo ?? null
  },

  async add(photo) {
    const full: Photo = {
      ...photo,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    await withStore(PHOTOS_STORE, 'readwrite', (store) => requestToPromise(store.add(full)))
    return full
  },

  async remove(id) {
    await withStore(PHOTOS_STORE, 'readwrite', (store) => requestToPromise(store.delete(id)))
  },
}
