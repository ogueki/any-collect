/**
 * 永続層をまたぐ Blob の取り回し。実装（IndexedDB / 将来の Supabase）に依存しないので
 * `indexedDb.ts`（＝IndexedDB 固有の事情を隔離する場所）ではなくここに置く。
 */

/**
 * **保存済みの Blob を、書き戻せる形に作り直す。**
 *
 * ⚠️ WebKit（iPhone Safari）では、IndexedDB から取り出した Blob は**ファイルへの参照**であって
 * 中身を持っていない。これをそのまま `put` すると書き込みの準備段階で落ちる：
 *   `UnknownError: Error preparing Blob/File data to be stored in object store`
 * （実機で確認・2026-08-12。図鑑の再発見で `count` を1つ増やすときに踏んだ）。
 *
 * ⚠️ **IndexedDB には部分更新が無い**＝スカラー1つ直すだけでもレコード全体、つまり Blob ごと
 * 書き直すことになる。「Blob は触っていないから安全」は成り立たない。
 * **読み出したレコードを書き戻すときは、必ず Blob をここに通すこと。**
 *
 * 中身が読めない（すでに壊れている等）ときは `null` を返す。
 * 代わりに何を書くかは呼び出し側が決める（記録ごと失うより新しい画像で埋める、など）。
 */
export async function rematerializeBlob(blob: Blob): Promise<Blob | null> {
  try {
    return new Blob([await blob.arrayBuffer()], { type: blob.type })
  } catch {
    return null
  }
}
