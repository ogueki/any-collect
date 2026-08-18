import type { IncomingMessage, ServerResponse } from 'node:http'
import type { InlineImage } from './gemini-image.js'

/**
 * api/ の全ハンドラが共有する HTTP ユーティリティ。
 *
 * ここに集約する理由＝**公開エンドポイントの守りを1箇所で担保する**ため。
 * `api/*.ts` はすべて無認証で公開されており（誰でも叩ける）、そのうち
 * generate-item / synthesize は 1 回あたり画像生成コストが発生する。
 * ここで提供するのは**仕様判断を含まない防御**だけ：
 *   - ボディ／画像サイズの上限（メモリ枯渇の防止）
 *   - personaId のサニタイズ（パストラバーサル防止）
 *   - プロンプトに載る自由文字列の正規化
 *   - エラー詳細を外に出さない
 *   - 発信元オリジンの検査（`rejectForeignOrigin`）
 *
 * ⚠️ **ひとりあたりの回数制限は入れない**（判断＝DECISIONS 2026-08-04・社内公開のため。
 * 再検討トリガー＝一般公開／社外配布／請求が想定超え／STEP6 着手）。
 * ⚠️ **全体の日次総量上限も未実装**＝予算の最終的な蓋は Vercel / Google 側の上限で持つ。
 * コード側で持つなら per-IP でなく**サーバ側の総量**（＝「1日いくらまで払うか」）から。
 */

export type NodeReq = IncomingMessage & { body?: unknown }

/**
 * 1 リクエストのボディ上限。釜の合成が透過 PNG 2 枚（各 1024px）を data URL で送るため
 * 余裕を持たせてある＝**正常系はこの上限に触れない**（サイズを絞る目的ではなく、
 * 無制限にメモリへ読み込ませない目的）。
 */
export const MAX_BODY_BYTES = 12 * 1024 * 1024

/** data URL に載せる画像 1 枚あたりの base64 上限（正常系＝長辺 1024px なので遠く及ばない）。 */
export const MAX_IMAGE_BASE64 = 10 * 1024 * 1024

/** ボディが上限を超えたとき投げる。呼び出し側が 413 に変換する。 */
export class PayloadTooLargeError extends Error {
  constructor() {
    super('リクエストボディが大きすぎます')
    this.name = 'PayloadTooLargeError'
  }
}

/**
 * JSON ボディを読む。Vercel は req.body を parse 済みのことがあり、
 * raw Node / Vite 経路では stream を読む（従来どおり）。
 * stream 経路では**受信バイト数を数えて上限で打ち切る**。
 */
export async function readJsonBody<T>(req: NodeReq, maxBytes = MAX_BODY_BYTES): Promise<T> {
  if (req.body && typeof req.body === 'object') {
    return req.body as T
  }
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    total += buf.length
    if (total > maxBytes) throw new PayloadTooLargeError()
    chunks.push(buf)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? (JSON.parse(raw) as T) : ({} as T)
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/**
 * 失敗レスポンス。**クライアントには当たり障りのない文言だけ**を返し、
 * 実際の例外（Gemini / Fish の生エラー＝アカウント情報やモデル名を含みうる）はサーバログにだけ出す。
 */
export function fail(
  res: ServerResponse,
  status: number,
  publicMessage: string,
  err?: unknown,
): void {
  if (err !== undefined) {
    console.error(`[api] ${publicMessage}:`, err instanceof Error ? (err.stack ?? err.message) : err)
  }
  if (res.headersSent) {
    res.end()
    return
  }
  sendJson(res, status, { error: publicMessage })
}

/**
 * 許可する発信元オリジン。**`ALLOWED_ORIGINS` が未設定なら空＝検査そのものを行わない**（opt-in）。
 * 設定を忘れただけで本番が全滅するほうが害が大きいので、既定は「今までどおり通す」にしてある。
 * 値はカンマ区切り（例: `https://any-collect.vercel.app,http://localhost:5173`）。
 * Vercel のプレビューは配信のたびにホスト名が変わるので `VERCEL_URL` を自動で足す。
 */
function allowedOrigins(): string[] {
  const configured = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/\/+$/, ''))
    .filter(Boolean)
  if (configured.length === 0) return []
  const vercelUrl = process.env.VERCEL_URL
  return vercelUrl ? [...configured, `https://${vercelUrl.toLowerCase()}`] : configured
}

/** 発信元オリジン。`Origin` が無ければ `Referer` から導出する。分からなければ null。 */
function requestOrigin(req: NodeReq): string | null {
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin) return origin.toLowerCase().replace(/\/+$/, '')
  const referer = req.headers.referer
  if (typeof referer === 'string' && referer) {
    try {
      return new URL(referer).origin.toLowerCase()
    } catch {
      return null
    }
  }
  return null
}

/**
 * 許可されていない発信元なら 403 を返して true（呼び出し側は
 * `if (rejectForeignOrigin(req, res)) return` を method チェックの直後に置く）。
 *
 * 狙い＝**ブラウザが自分のデプロイから送ったものだけを通す**＝URL を知った人が curl や
 * スクリプトで直接叩く経路（`Origin` も `Referer` も付かない）を落とす。
 *
 * ⚠️ **これは鍵ではない。** `Origin` は偽装できるので、本気で叩く相手は止まらない。
 * 目的は「無防備で置いていたわけではない」ことと、素朴な叩かれ方の遮断まで。
 * 予算の最終的な蓋はプラットフォーム側の上限で持つ（認証の本体は STEP6）。
 */
export function rejectForeignOrigin(req: NodeReq, res: ServerResponse): boolean {
  const allowed = allowedOrigins()
  if (allowed.length === 0) return false
  const origin = requestOrigin(req)
  if (origin && allowed.includes(origin)) return false
  sendJson(res, 403, { error: '許可されていないリクエストです' })
  return true
}

/**
 * `src/characters/<id>/` のディレクトリ名として安全な形だけ通す。
 * これを通さないと `personaId: '../../..'` のような値が `resolve()` に入り、
 * リポジトリ外の persona.md / voice.json を読ませられる（パストラバーサル）。
 */
const PERSONA_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/

export function sanitizePersonaId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return PERSONA_ID_RE.test(trimmed) ? trimmed : undefined
}

/** 制御文字（改行・タブ・DEL 等）。プロンプトの構造を壊させないため空白に潰す。 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = new RegExp('[\u0000-\u001f\u007f]', 'g')

/**
 * プロンプトに載せる自由文字列の正規化。制御文字を潰して長さで切る。
 * ＝クライアント由来のテキストが system prompt の構造を壊さないようにする。
 */
export function sanitizeText(raw: unknown, maxLen: number): string | undefined {
  if (typeof raw !== 'string') return undefined
  const cleaned = raw.replace(CONTROL_CHARS_RE, ' ').replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maxLen) : undefined
}

/** data URL の base64 部分が上限内かを見る（巨大画像でトークン/メモリを食わせない）。 */
export function isImageWithinLimit(base64: string, maxBase64 = MAX_IMAGE_BASE64): boolean {
  return base64.length <= maxBase64
}

/**
 * `data:image/jpeg;base64,XXXX` を `{ mimeType, data }` に分解する。
 * 各ハンドラに同じ実装が散っていたのでここへ集約した（形式が不正なら null）。
 * サイズ判定は分けてある＝呼び出し側が 400（不正）と 413（大きすぎ）を出し分けられるように。
 */
export function parseImageDataUrl(dataUrl: unknown): InlineImage | null {
  if (typeof dataUrl !== 'string') return null
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

/**
 * 各 AI 呼び出しの所要時間を計測する（生成の遅さを追うときの道具）。
 * **本番では出さない**＝検証用のログが毎リクエスト Vercel のログに積もらないように。
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV === 'production') return fn()
  const start = Date.now()
  try {
    return await fn()
  } finally {
    console.log(`[api] ${label}: ${Date.now() - start}ms`)
  }
}
