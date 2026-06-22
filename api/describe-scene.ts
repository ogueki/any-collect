import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadPersona, buildSceneSystemPrompt } from './_lib/persona.js'
import { generateSceneComment } from './_lib/gemini.js'
import type { InlineImage } from './_lib/gemini-image.js'

/**
 * 風景コメント API プロキシ（STEP7）。
 * カメラで見せた景色の画像から、妖精のひとことコメント＋感情を生成して返す。
 *
 * - 図鑑には登録しない「その場の演出」。元写真は保存しない（このリクエストとともに破棄）。
 * - persona を参照して口調を統一（claude.md 原則3）。Gemini の鍵はサーバ側のみ（原則1）。
 *
 * Node 素の (req, res) ハンドラ。本番は Vercel Function、dev は vite の apiDevServer で同一コードが動く。
 */

interface DescribeSceneRequestBody {
  /** data URL（例: 'data:image/jpeg;base64,...'） */
  image?: string
  personaId?: string
}

type NodeReq = IncomingMessage & { body?: unknown }

async function readJsonBody(req: NodeReq): Promise<DescribeSceneRequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as DescribeSceneRequestBody
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? (JSON.parse(raw) as DescribeSceneRequestBody) : {}
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

  let body: DescribeSceneRequestBody
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const image = typeof body.image === 'string' ? parseDataUrl(body.image) : null
  if (!image) {
    sendJson(res, 400, { error: '景色画像（image: data URL）が不正です' })
    return
  }

  try {
    const systemPrompt = buildSceneSystemPrompt(loadPersona(body.personaId))
    const { comment, emotion } = await generateSceneComment({ apiKey, systemPrompt, image })
    sendJson(res, 200, { comment, emotion })
  } catch (err) {
    const message = err instanceof Error ? err.message : '風景コメントの生成に失敗しました'
    sendJson(res, 502, { error: message })
  }
}
