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
  /** コレットとの好感度レベル（1..）。口調 tier の選択に使う（クライアントが送る） */
  affinityLevel?: number
  /** コレットが覚えている「きみについての短い事実」（クライアントが送る・接地注入） */
  memoryFacts?: { key?: unknown; value?: unknown }[]
  /** きみの最近のようす（図鑑・アルバム傾向）。クライアントが集計した短いノート（接地注入・STEP2c） */
  groundingNotes?: unknown
  /** 'opening' ならコレットからの第一声を生成（userInput 不要・履歴なし想定） */
  mode?: unknown
  /** いまの時間帯（朝/昼/夕方/夜/深夜）。クライアントの現地時刻から。allowlist 検証する */
  timeOfDay?: unknown
  /** まほうパワーが満タンか（opening で召喚に誘う判断に使う） */
  gaugeFull?: unknown
  /** どんな再会か（first/back/days）。opening の温度感に使う。allowlist 検証する */
  reunion?: unknown
}

/** timeOfDay として受け付ける値（自由文字列を system prompt に入れない） */
const TIME_OF_DAY_VALUES = ['朝', '昼', '夕方', '夜', '深夜'] as const

/** reunion として受け付ける値（同上。クライアントの ReunionBucket と対応） */
const REUNION_VALUES = ['first', 'back', 'days'] as const

/** モデルに渡す履歴の上限（クライアントは窓で絞って送るが、サーバ側でも信用しない） */
const MAX_HISTORY_TURNS = 20
const MAX_TURN_CHARS = 1000

/** opening のとき Gemini に渡す固定のユーザーターン（contents は空にできないため） */
const OPENING_USER_TURN =
  '（きみがアプリをひらいて、コレットのところに来たよ。「いまの場面」の指示どおり、コレットから最初のひとことを話しかけて）'

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

  const opening = body.mode === 'opening'
  const userInput =
    typeof body.userInput === 'string' ? body.userInput.trim().slice(0, MAX_TURN_CHARS) : ''
  if (!userInput && !opening) {
    sendJson(res, 400, { error: 'userInput が空です' })
    return
  }

  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((m) => m && (m.role === 'user' || m.role === 'fairy'))
        .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, MAX_TURN_CHARS) }))
        .slice(-MAX_HISTORY_TURNS)
    : []

  try {
    const affinityLevel =
      typeof body.affinityLevel === 'number' && Number.isFinite(body.affinityLevel)
        ? body.affinityLevel
        : undefined
    const memoryFacts = Array.isArray(body.memoryFacts)
      ? body.memoryFacts
          .filter((f) => f && typeof f.key === 'string' && typeof f.value === 'string')
          .map((f) => ({ key: String(f.key), value: String(f.value) }))
          .slice(0, 12)
      : undefined
    const groundingNotes = Array.isArray(body.groundingNotes)
      ? body.groundingNotes
          .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
          .map((n) => n.slice(0, 200))
          .slice(0, 3)
      : undefined
    const timeOfDay =
      typeof body.timeOfDay === 'string' &&
      (TIME_OF_DAY_VALUES as readonly string[]).includes(body.timeOfDay)
        ? body.timeOfDay
        : undefined
    const reunion =
      typeof body.reunion === 'string' &&
      (REUNION_VALUES as readonly string[]).includes(body.reunion)
        ? (body.reunion as (typeof REUNION_VALUES)[number])
        : undefined
    const systemPrompt = buildSystemPrompt(loadPersona(body.personaId), {
      affinityLevel,
      memoryFacts,
      groundingNotes,
      timeOfDay,
      opening,
      gaugeFull: body.gaugeFull === true,
      reunion,
    })
    const { text, emotion } = await generateChatReply({
      apiKey,
      systemPrompt,
      history,
      userInput: opening ? OPENING_USER_TURN : userInput,
    })
    sendJson(res, 200, { reply: text, emotion })
  } catch (err) {
    const message = err instanceof Error ? err.message : '会話の生成に失敗しました'
    sendJson(res, 502, { error: message })
  }
}
