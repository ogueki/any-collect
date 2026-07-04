import type { CollectionEntry } from '../../types'

/**
 * 図鑑（実物クロップの収集）の永続化の抽象（Repository パターン・v2）。
 * 実装は IndexedDB（先行・既定ローカル）／Supabase（後続・opt-in クラウド）を差し替え可能にする。
 *
 * PhotoRepository と違い `put`（upsert）を持つのが肝：同種を再発見したら count を +1 して
 * 同じ id に書き戻すため（新規追加も更新も同じ primitive で扱う）。デデュープ判定
 * （speciesKey 突合）は呼び出し側（collectionStore）がメモリ上の一覧に対して行う。
 */
export interface CollectionRepository {
  /** 一覧する（並び順は呼び出し側で決める） */
  list(): Promise<CollectionEntry[]>
  get(id: string): Promise<CollectionEntry | null>
  /** 追加も更新も upsert で行う（キーは id）。呼び出し側が完成済みエントリを渡す */
  put(entry: CollectionEntry): Promise<CollectionEntry>
  remove(id: string): Promise<void>
}
