import { create } from 'zustand'
import type { Photo } from '../types'
import type { FairyExpression } from '../lib/character/CharacterRenderer'
import { photoRepository } from '../lib/storage/repository'

/**
 * アルバム（カメラで保存した写真）の状態。永続化は `photoRepository` 越し
 * （`codexStore` に倣う）。アルバムは「思い出資産」であり、コレットの会話接地
 * （写真言及）の燃料源でもある（§4.2 / §4.4）。
 */

export type AlbumStatus = 'idle' | 'loading' | 'error'

interface AlbumState {
  photos: Photo[]
  status: AlbumStatus
  error: string | null
  /** 永続層からアルバムを読み込む（新しい順） */
  load: () => Promise<void>
  /** 撮影した写真を保存する。保存済み Photo を返す */
  add: (input: { blob: Blob; comment?: string; emotion?: FairyExpression }) => Promise<Photo>
  /** 写真を削除する */
  remove: (id: string) => Promise<void>
}

export const useAlbumStore = create<AlbumState>((set) => ({
  photos: [],
  status: 'idle',
  error: null,

  load: async () => {
    set({ status: 'loading', error: null })
    try {
      const photos = await photoRepository.list()
      set({ photos, status: 'idle' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'アルバムの読み込みに失敗しました'
      set({ status: 'error', error: message })
    }
  },

  add: async (input) => {
    const saved = await photoRepository.add(input)
    // list() と同じ「新しい順」を保つため先頭に積む。
    set((s) => ({ photos: [saved, ...s.photos] }))
    return saved
  },

  remove: async (id) => {
    await photoRepository.remove(id)
    set((s) => ({ photos: s.photos.filter((p) => p.id !== id) }))
  },
}))
