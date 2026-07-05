import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildMemorySystemPrompt } from './_lib/persona.js'
import { consolidateMemory, type ChatTurn, type MemoryFactWire } from './_lib/gemini.js'

/**
 * 記憶の要約 API プロキシ（v2・STEP2b）。直近の会話＋現在の facts から、更新後の facts を返す。
 * Gemini の API キーはサーバ側にのみ置く（claude.md 原則1）。
 *
 * Node 素の (req, res) ハンドラ。本番は Vercel Function、dev は vite の apiDevServer で同一コードが動く。
 */

interface MemoryRequestBody {
  messages?: ChatTurn[]
  facts?: MemoryFactWire[]
}

type NodeReq = IncomingMessage & { body?: unknown }

async function readJsonBody(req: NodeReq): Promise<MemoryRequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as MemoryRequestBody
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? (JSON.parse(raw) as MemoryRequestBody) : {}
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

  let body: MemoryRequestBody
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const messages: ChatTurn[] = Array.isArray(body.messages)
    ? body.messages
        .filter((m) => m && (m.role === 'user' || m.role === 'fairy'))
        .map((m) => ({ role: m.role, content: String(m.content ?? '') }))
    : []

  const currentFacts: MemoryFactWire[] = Array.isArray(body.facts)
    ? body.facts
        .filter((f) => f && typeof f.key === 'string' && typeof f.value === 'string')
        .map((f) => ({ key: String(f.key), value: String(f.value) }))
    : []

  // 覚える材料（ユーザー発話）が無ければ現状維持で返す（無駄な生成を避ける）。
  if (!messages.some((m) => m.role === 'user' && m.content.trim())) {
    sendJson(res, 200, { facts: currentFacts })
    return
  }

  try {
    const facts = await consolidateMemory({
      apiKey,
      systemPrompt: buildMemorySystemPrompt(),
      messages,
      currentFacts,
    })
    sendJson(res, 200, { facts })
  } catch (err) {
    const message = err instanceof Error ? err.message : '記憶の更新に失敗しました'
    sendJson(res, 502, { error: message })
  }
}
