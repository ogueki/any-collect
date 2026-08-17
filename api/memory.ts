import type { ServerResponse } from 'node:http'
import { buildMemorySystemPrompt } from './_lib/persona.js'
import { consolidateMemory, type ChatTurn, type MemoryFactWire } from './_lib/gemini.js'
import {
  fail,
  PayloadTooLargeError,
  readJsonBody,
  rejectForeignOrigin,
  sanitizeText,
  sendJson,
  type NodeReq,
} from './_lib/http.js'

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

/**
 * サーバ側の上限（クライアントを信用しない）。
 * 正常系はクライアントが `CONSOLIDATE_EVERY`(6) ごとに十数件送るだけなので**この上限には触れない**。
 * 上限が無いと 1 リクエストで巨大なテキストを Gemini に送れてしまう＝コストの増幅器になる。
 */
const MAX_MESSAGES = 40
const MAX_MESSAGE_CHARS = 2000
const MAX_FACTS = 24
const MAX_FACT_KEY_CHARS = 40
const MAX_FACT_VALUE_CHARS = 200

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

  let body: MemoryRequestBody
  try {
    body = await readJsonBody<MemoryRequestBody>(req)
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      sendJson(res, 413, { error: 'リクエストが大きすぎます' })
      return
    }
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const messages: ChatTurn[] = Array.isArray(body.messages)
    ? body.messages
        .filter((m) => m && (m.role === 'user' || m.role === 'fairy'))
        .slice(-MAX_MESSAGES)
        .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, MAX_MESSAGE_CHARS) }))
    : []

  const currentFacts: MemoryFactWire[] = Array.isArray(body.facts)
    ? body.facts
        .slice(0, MAX_FACTS)
        .map((f) => ({
          key: sanitizeText(f?.key, MAX_FACT_KEY_CHARS),
          value: sanitizeText(f?.value, MAX_FACT_VALUE_CHARS),
        }))
        .filter((f): f is MemoryFactWire => !!f.key && !!f.value)
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
    fail(res, 502, '記憶の更新に失敗しました', err)
  }
}
