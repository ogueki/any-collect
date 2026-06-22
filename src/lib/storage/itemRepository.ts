import type { Item, Synthesis } from '../../types'

/**
 * 永続化の抽象（Repository パターン）。
 * 実装は IndexedDB / Supabase を差し替え可能にし、オフライン対応・
 * ネイティブ移行を容易にする。Supabase 実装は STEP9 で追加。
 */
export interface ItemRepository {
  list(): Promise<Item[]>
  get(id: string): Promise<Item | null>
  add(item: Omit<Item, 'id' | 'createdAt'>): Promise<Item>
  remove(id: string): Promise<void>
  recordSynthesis(s: Omit<Synthesis, 'id' | 'createdAt'>): Promise<Synthesis>
}
