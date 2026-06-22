import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadPersona, buildSystemPrompt } from './_lib/persona.js'
import { generateChatReply, type ChatTurn } from './_lib/gemini.js'

/**
 * 会話 API プロキシ。Gemini の API キーはサーバ側にのみ置く（claude.md 原則1）。
 *
 * Node 素の (req, res) ハンドラとして書くことで、
 *   - 本番: Vercel Serverless Function としてそのまま実行
 *   - dev : vite.config.ts の apiDevServer プラグインがミドルウェアとして実行
 * の両方で同一コードが動く（res は基底メソッドのみ使用）。
 */

interface ChatRequestBody {
  history?: ChatTurn[]
  userInput?: string
  personaId?: string
}

type NodeReq = IncomingMessage & { body?: unknown }

// Vercel は req.body を parse 済みのことがある。raw Node / Vite 経路では stream を読む。
async function readJsonBody(req: NodeReq): Promise<ChatRequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as ChatRequestBody
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? (JSON.parse(raw) as ChatRequestBody) : {}
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
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

  let body: ChatRequestBody
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const userInput = typeof body.userInput === 'string' ? body.userInput.trim() : ''
  if (!userInput) {
    sendJson(res, 400, { error: 'userInput が空です' })
    return
  }

  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((m) => m && (m.role === 'user' || m.role === 'fairy'))
        .map((m) => ({ role: m.role, content: String(m.content ?? '') }))
    : []

  try {
    const systemPrompt = buildSystemPrompt(loadPersona(body.personaId))
    const { text, emotion } = await generateChatReply({ apiKey, systemPrompt, history, userInput })
    sendJson(res, 200, { reply: text, emotion })
  } catch (err) {
    const message = err instanceof Error ? err.message : '会話の生成に失敗しました'
    sendJson(res, 502, { error: message })
  }
}
