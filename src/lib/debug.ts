/**
 * 検証用ツールの表示スイッチ。
 *
 * 実機テストは本番 Vercel 上で行う（dev サーバは別オリジン＝IndexedDB が分かれる／カメラも不可）ため
 * `import.meta.env.DEV` では切り替えられない。そこで **URL クエリで切り替えて localStorage に永続**する。
 *
 * ・`?debug=1` … 有効化（以後このブラウザでは URL 無しでも有効）
 * ・`?debug=0` … 無効化
 *
 * 既定はオフ＝検証用の仕掛けが一般ユーザーに出ることはない。これにより「リリース前に外す」宿題を持たずに
 * 検証用ツールを本番へ載せておける（ROADMAP の「ローンチ前まで残す」決定と両立）。
 */

const KEY = 'anycollect.debug'

function read(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('debug')
    if (q === '1') {
      localStorage.setItem(KEY, '1')
      return true
    }
    if (q === '0') {
      localStorage.removeItem(KEY)
      return false
    }
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false // localStorage 不可（プライベートモード等）でも落とさない
  }
}

/** 起動時に一度だけ評価する（レンダー中に window/localStorage を読まない）。 */
const enabled = read()

/** 検証用ツール（ゲージ/なつきの手動操作・記憶の手動要約など）を出してよいか。 */
export function debugTools(): boolean {
  return enabled
}
