import { deleteDb } from './indexedDb'

/**
 * 検証用：アプリの永続データを全消しして「完全な初期環境」に戻す（`?debug=1` の初期化から呼ぶ）。
 *
 * 消す対象は 2 か所に散っている：
 * - **IndexedDB**（アイテム／写真／図鑑）＝ DB ごと削除。
 * - **localStorage** の `anycollect.*`（ゲージ／なつき／記憶／会話履歴／オンボ）。
 *   ただし `anycollect.debug` は残す＝リロード後も検証ツールが使えて、また初期化できる。
 *   （完全に「無 debug」の見え方を確認したいときは `?debug=0` を付けて開けばよい。）
 *
 * 呼び出し側は解決後に `location.reload()` する。各ストアは起動時に localStorage / IndexedDB を
 * 読んで初期化するので、空になった状態から「初回ユーザー」と同じ画面（オンボ intro）で立ち上がる。
 */

/** lib/debug.ts の KEY と一致（残して検証を続けられるようにする）。 */
const DEBUG_KEY = 'anycollect.debug'

export async function resetAllData(): Promise<void> {
  // 1) localStorage の anycollect.*（debug 以外）を削除。
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('anycollect.') && k !== DEBUG_KEY) toRemove.push(k)
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
  } catch {
    // localStorage 不可でも IndexedDB の削除は進める。
  }
  // 2) IndexedDB を DB ごと削除。
  await deleteDb()
}
