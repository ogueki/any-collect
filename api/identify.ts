import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadPersona } from './_lib/persona.js'
import { buildIdentifySystemPrompt } from './_lib/item-prompt.js'
import { identifySubject } from './_lib/gemini.js'
import type { InlineImage } from './_lib/gemini-image.js'

/**
 * 図鑑（Seek 型）判定 API プロキシ（STEP1d）。
 * カメラで撮った写真から、コレットのひとこと＋感情＋写っている主役（名前/種キー/カテゴリ/レア度/bbox）を返す。
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

type NodeReq = IncomingMessage & { body?: unknown }

async function readJsonBody(req: NodeReq): Promise<IdentifyRequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as IdentifyRequestBody
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? (JSON.parse(raw) as IdentifyRequestBody) : {}
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/** 'data:image/jpeg;base64,XXXX' を { mimeType, data } に分解する。 */
function parseDataUrl(dataUrl: string): InlineImage | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

export default async function handler(req: NodeReq, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'POST のみ対応しています' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    sendJson(res, 500, { error: 'サーバに GEMINI_API_KEY が設定されていません' })
    return
  }

  let body: IdentifyRequestBody
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const image = typeof body.image === 'string' ? parseDataUrl(body.image) : null
  if (!image) {
    sendJson(res, 400, { error: '写真（image: data URL）が不正です' })
    return
  }

  try {
    const systemPrompt = buildIdentifySystemPrompt(loadPersona(body.personaId))
    const result = await identifySubject({ apiKey, systemPrompt, image })
    sendJson(res, 200, result)
  } catch (err) {
    const message = err instanceof Error ? err.message : '写真の判定に失敗しました'
    sendJson(res, 502, { error: message })
  }
}
