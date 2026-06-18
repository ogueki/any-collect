import type { ItemRepository } from './itemRepository'
import { indexedDbItemRepository } from './indexedDbItemRepository'

/**
 * アプリ全体で使う永続化リポジトリ。実装の差し替えはこの1箇所で行う
 * （AI プロバイダの `imageGen.ts`／`chat.ts` と同じ単一差し替え点パターン）。
 *
 * STEP4a は端末ローカル（IndexedDB）。STEP4b で SupabaseItemRepository を実装したら
 * ここを差し替えるだけで、呼び出し側（codexStore 等）は無改修で切り替わる。
 */
export const itemRepository: ItemRepository = indexedDbItemRepository
