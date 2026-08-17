import type { ServerResponse } from 'node:http'
import { loadPersona } from './_lib/persona.js'
import { buildIdentifySystemPrompt } from './_lib/item-prompt.js'
import { identifySubject } from './_lib/gemini.js'
import {
  fail,
  isImageWithinLimit,
  parseImageDataUrl,
  PayloadTooLargeError,
  readJsonBody,
  rejectForeignOrigin,
  sanitizePersonaId,
  sendJson,
  type NodeReq,
} from './_lib/http.js'

/**
 * 図鑑（Seek 型）判定 API プロキシ（STEP1d）。
 * カメラで撮った写真から、コレットのひとこと＋感情＋写っている主役（名前/種キー/カテゴリ/bbox）を返す。
 *
 * - 画像生成はしない＝安価な vision 呼び出し（無制限収集に耐える）。クロップはクライアント側 canvas。
 * - 風景コメント（describe-scene.ts＝妖精タップの一言）とは別ルート。あちらは図鑑に残さない。
 * - persona を参照して口調を統一（claude.md 原則3）。Gemini の鍵はサーバ側のみ（原則1）。
 *
 * Node 素の (req, res) ハンドラ。本番は Vercel Function、dev は vite の apiDevServer で同一コードが動く。
 */

interface IdentifyRequestBody {
  /** data URL（例: 'data:image/jpeg;base64,...'） */
  image?: string
  personaId?: string
}

export default async function handler(req: NodeReq, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'POST のみ対応しています' })
    return
  }
  if (rejectForeignOrigin(req, res)) return

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    fail(res, 500, 'サーバの設定が不足しています', 'GEMINI_API_KEY が未設定')
    return
  }

  let body: IdentifyRequestBody
  try {
    body = await readJsonBody<IdentifyRequestBody>(req)
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      sendJson(res, 413, { error: 'リクエストが大きすぎます' })
      return
    }
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const image = parseImageDataUrl(body.image)
  if (!image) {
    sendJson(res, 400, { error: '写真（image: data URL）が不正です' })
    return
  }
  if (!isImageWithinLimit(image.data)) {
    sendJson(res, 413, { error: '写真が大きすぎます' })
    return
  }

  try {
    const systemPrompt = buildIdentifySystemPrompt(loadPersona(sanitizePersonaId(body.personaId)))
    const result = await identifySubject({ apiKey, systemPrompt, image })
    sendJson(res, 200, result)
  } catch (err) {
    fail(res, 502, '写真の判定に失敗しました', err)
  }
}
