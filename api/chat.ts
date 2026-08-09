import type { ServerResponse } from 'node:http'
import { loadPersona, buildSystemPrompt } from './_lib/persona.js'
import { generateChatReply, type ChatTurn } from './_lib/gemini.js'
import {
  fail,
  isImageWithinLimit,
  parseImageDataUrl,
  PayloadTooLargeError,
  readJsonBody,
  sanitizePersonaId,
  sanitizeText,
  sendJson,
  type NodeReq,
} from './_lib/http.js'

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
  /**
   * この1リクエストにだけ載る話題（アルバム/図鑑から「これの話をしたい」と持ち出したもの）。
   * クライアント由来の自由文字列なので sanitizeText を通す。
   */
  topicNote?: unknown
  /** 「この写真の話をする」で添える写真（data URL）。無ければテキストだけで会話する。 */
  image?: unknown
}

/** timeOfDay として受け付ける値（自由文字列を system prompt に入れない） */
const TIME_OF_DAY_VALUES = ['朝', '昼', '夕方', '夜', '深夜'] as const

/** reunion として受け付ける値（同上。クライアントの ReunionBucket と対応） */
const REUNION_VALUES = ['first', 'back', 'days'] as const

/** モデルに渡す履歴の上限（クライアントは窓で絞って送るが、サーバ側でも信用しない） */
const MAX_HISTORY_TURNS = 20
const MAX_TURN_CHARS = 1000

/** 「これの話をしたい」で渡す話題ノートの上限（名前＋日付＋そのときのひとこと ぶん） */
const MAX_TOPIC_NOTE_CHARS = 300

/** opening のとき Gemini に渡す固定のユーザーターン（contents は空にできないため） */
const OPENING_USER_TURN =
  '（きみがアプリをひらいて、コレットのところに来たよ。「いまの場面」の指示どおり、コレットから最初のひとことを話しかけて）'

export default async function handler(req: NodeReq, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'POST のみ対応しています' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    fail(res, 500, 'サーバの設定が不足しています', 'GEMINI_API_KEY が未設定')
    return
  }

  let body: ChatRequestBody
  try {
    body = await readJsonBody<ChatRequestBody>(req)
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      sendJson(res, 413, { error: 'リクエストが大きすぎます' })
      return
    }
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
    // 記憶ファクト・接地ノートはクライアント由来の自由文字列がそのまま system prompt に載る。
    // 制御文字を潰して長さで切る（プロンプトの構造を壊させない）。
    const memoryFacts = Array.isArray(body.memoryFacts)
      ? body.memoryFacts
          .slice(0, 12)
          .map((f) => ({ key: sanitizeText(f?.key, 40), value: sanitizeText(f?.value, 200) }))
          .filter((f): f is { key: string; value: string } => !!f.key && !!f.value)
      : undefined
    const groundingNotes = Array.isArray(body.groundingNotes)
      ? body.groundingNotes
          .slice(0, 3)
          .map((n) => sanitizeText(n, 200))
          .filter((n): n is string => !!n)
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
    // 「これの話をしたい」の1件だけ。接地ノートと同じくクライアント由来の自由文字列。
    const topicNote = sanitizeText(body.topicNote, MAX_TOPIC_NOTE_CHARS)
    // 写真は任意。不正・大きすぎなら**添えないだけ**で会話は続ける（テキストの手がかりで話す）。
    const parsedImage = parseImageDataUrl(body.image)
    const image = parsedImage && isImageWithinLimit(parsedImage.data) ? parsedImage : undefined
    const systemPrompt = buildSystemPrompt(loadPersona(sanitizePersonaId(body.personaId)), {
      affinityLevel,
      memoryFacts,
      groundingNotes,
      timeOfDay,
      opening,
      gaugeFull: body.gaugeFull === true,
      reunion,
      topicNote,
      hasImage: !!image,
    })
    const { text, emotion, voiceDirection } = await generateChatReply({
      apiKey,
      systemPrompt,
      history,
      userInput: opening ? OPENING_USER_TURN : userInput,
      image,
    })
    sendJson(res, 200, { reply: text, emotion, voiceDirection })
  } catch (err) {
    fail(res, 502, '会話の生成に失敗しました', err)
  }
}
