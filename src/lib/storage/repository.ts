import type { ItemRepository } from './itemRepository'
import { indexedDbItemRepository } from './indexedDbItemRepository'
import type { PhotoRepository } from './photoRepository'
import { indexedDbPhotoRepository } from './indexedDbPhotoRepository'
import type { CollectionRepository } from './collectionRepository'
import { indexedDbCollectionRepository } from './indexedDbCollectionRepository'

/**
 * アプリ全体で使う永続化リポジトリ。実装の差し替えはこの1箇所で行う
 * （AI プロバイダの `imageGen.ts`／`chat.ts` と同じ単一差し替え点パターン）。
 *
 * 現状は端末ローカル（IndexedDB）。STEP6 で Supabase 実装を追加したら
 * ここを差し替えるだけで、呼び出し側（codexStore / albumStore 等）は無改修で切り替わる。
 */
export const itemRepository: ItemRepository = indexedDbItemRepository
export const photoRepository: PhotoRepository = indexedDbPhotoRepository
export const collectionRepository: CollectionRepository = indexedDbCollectionRepository
