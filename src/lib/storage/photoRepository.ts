import type { Photo } from '../../types'

/**
 * アルバム写真の永続化の抽象（Repository パターン・v2）。
 * 実装は IndexedDB（先行・既定ローカル）／Supabase Storage（後続・opt-in クラウド）を
 * 差し替え可能にする。§9 のデータ2クラス：生写真は既定ローカル / opt-in クラウド。
 */
export interface PhotoRepository {
  /** 新しい順で一覧する */
  list(): Promise<Photo[]>
  get(id: string): Promise<Photo | null>
  add(photo: Omit<Photo, 'id' | 'createdAt'>): Promise<Photo>
  remove(id: string): Promise<void>
}
