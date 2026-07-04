/**
 * Gemini（テキスト/マルチモーダル）呼び出し。モデル固有の実装はこのファイルに閉じ込める。
 * 将来 Claude へ差し替える場合は `claude.ts` を足して chat.ts の import を切り替えるだけにする
 * （claude.md 原則2：具体実装に直接依存しない）。
 *
 * 追加依存を避けるため SDK ではなく Node18+ の global fetch で REST を叩く。
 */

import type { InlineImage } from './gemini-image.js'
import { CATEGORY_VALUES, RARITY_VALUES, type ItemCategoryKey, type Rarity } from './item-prompt.js'

const DEFAULT_MODEL = 'gemini-2.5-flash'

export interface ChatTurn {
  role: 'user' | 'fairy'
  content: string
}

/**
 * 会話の返事に添える妖精の感情。client の FAIRY_EXPRESSIONS のミラー
 * （Rarity 同様、api/client で二重定義する前例に倣う）。
 * `searching`（カメラ鑑定中専用）だけは会話では使わないので除く。
 */
export const CHAT_EMOTIONS = [
  'neutral',
  'happy',
  'surprised',
  'sad',
  'excited',
  'shy',
  'confused',
  'exasperated',
  'angry',
  'salute',
  'thinking',
] as const
export type ChatEmotion = (typeof CHAT_EMOTIONS)[number]

export interface ChatReply {
  text: string
  emotion: ChatEmotion
}

interface GenerateArgs {
  apiKey: string
  systemPrompt: string
  history: ChatTurn[]
  userInput: string
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: { text: string }[]
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
}

/** Gemini が稀に ```json ... ``` で包むことがあるので剥がす（responseMimeType 指定時は通常不要だが保険）。 */
function stripCodeFence(raw: string): string {
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenced ? fenced[1].trim() : raw
}

/**
 * 会話履歴＋ユーザー入力から、妖精の応答テキストと感情を生成する。
 * responseSchema で「返事文＋自分の口調に合う感情」を1度に出させる（generateItemMeta と同方式）。
 */
export async function generateChatReply({
  apiKey,
  systemPrompt,
  history,
  userInput,
}: GenerateArgs): Promise<ChatReply> {
  const model = process.env.GEMINI_TEXT_MODEL || DEFAULT_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const contents: GeminiContent[] = [
    ...history.map((m) => ({
      role: m.role === 'fairy' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: userInput }] },
  ]

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 0.9,
        topP: 0.95,
        // 会話は推論不要なので thinking を無効化（トークン浪費＝JSON途中切れ・コスト/遅延の元）。
        thinkingConfig: { thinkingBudget: 0 },
        // JSON 構造ぶんの余裕を持たせる（小さすぎると返事が途中で切れて JSON が壊れる）。
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            text: { type: 'STRING', description: '妖精としての返事（口調はペルソナに従う）' },
            emotion: {
              type: 'STRING',
              enum: [...CHAT_EMOTIONS],
              description:
                'ペルソナの「感情の出し方」を参考に、返事の気持ちに最も合う感情を1つだけ選ぶ',
            },
          },
          required: ['text', 'emotion'],
        },
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini API エラー (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }

  const data = (await res.json()) as GeminiResponse
  const candidate = data.candidates?.[0]
  const raw = candidate?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? ''

  if (!raw) {
    const reason = data.promptFeedback?.blockReason
    throw new Error(
      reason ? `応答がブロックされました (${reason})` : '妖精の返事を取得できませんでした',
    )
  }

  let parsed: Partial<ChatReply>
  try {
    parsed = JSON.parse(stripCodeFence(raw)) as Partial<ChatReply>
  } catch {
    // MAX_TOKENS で JSON が途中で切れたケースを区別して伝える。
    const truncated = candidate?.finishReason === 'MAX_TOKENS'
    throw new Error(
      truncated
        ? '妖精の返事が長すぎて途切れました（もう一度試してね）'
        : '妖精の返事の JSON 解析に失敗しました',
    )
  }

  const text = typeof parsed.text === 'string' ? parsed.text.trim() : ''
  if (!text) {
    throw new Error('妖精の返事が空でした')
  }

  // 不正/欠落な emotion は neutral にフォールバック（表示は壊さない）。
  const emotion =
    typeof parsed.emotion === 'string' && (CHAT_EMOTIONS as readonly string[]).includes(parsed.emotion)
      ? (parsed.emotion as ChatEmotion)
      : 'neutral'

  return { text, emotion }
}

export interface ItemMeta {
  name: string
  description: string
  /** 安定キー。enum を強制＋未知は other にフォールバックするので常に有効値が入る。 */
  category: ItemCategoryKey
  rarity?: Rarity
}

interface GenerateMetaArgs {
  apiKey: string
  /** persona を前置きしたアイテム命名用 system prompt */
  systemPrompt: string
  /** アイテム化する撮影画像 */
  image: InlineImage
}

/** 撮影画像（＋persona）から、アイテムの名前・説明・カテゴリ・レア度を JSON で生成する。 */
export async function generateItemMeta({
  apiKey,
  systemPrompt,
  image,
}: GenerateMetaArgs): Promise<ItemMeta> {
  const model = process.env.GEMINI_TEXT_MODEL || DEFAULT_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'この写真に写っているモノをアイテム化して、スキーマ通りの JSON で答えて。' },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            description: { type: 'STRING' },
            category: { type: 'STRING', enum: [...CATEGORY_VALUES] },
            rarity: { type: 'STRING', enum: [...RARITY_VALUES] },
          },
          required: ['name', 'description', 'category', 'rarity'],
        },
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Gemini API エラー (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    )
  }

  const data = (await res.json()) as GeminiResponse
  const raw =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? ''

  if (!raw) {
    const reason = data.promptFeedback?.blockReason
    throw new Error(
      reason ? `アイテム情報がブロックされました (${reason})` : 'アイテム情報を取得できませんでした',
    )
  }

  let parsed: Partial<ItemMeta>
  try {
    parsed = JSON.parse(raw) as Partial<ItemMeta>
  } catch {
    throw new Error('アイテム情報の JSON 解析に失敗しました')
  }

  const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : ''
  if (!name || !description) {
    throw new Error('アイテムの名前または説明が空でした')
  }

  const rarity =
    typeof parsed.rarity === 'string' && (RARITY_VALUES as readonly string[]).includes(parsed.rarity)
      ? (parsed.rarity as Rarity)
      : undefined
  // enum 強制でも保険として検証し、外れていれば other に倒す（rarity と同方式）。
  const category: ItemCategoryKey =
    typeof parsed.category === 'string' && (CATEGORY_VALUES as readonly string[]).includes(parsed.category)
      ? (parsed.category as ItemCategoryKey)
      : 'other'

  return { name, description, category, rarity }
}

interface GenerateSynthesisMetaArgs {
  apiKey: string
  systemPrompt: string
}

/** 2つのアイテム情報（＋persona）から、合成結果の名前・説明・カテゴリ・レア度を JSON で生成する。 */
export async function generateSynthesisMeta({
  apiKey,
  systemPrompt,
}: GenerateSynthesisMetaArgs): Promise<ItemMeta> {
  const model = process.env.GEMINI_TEXT_MODEL || DEFAULT_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: '2つの素材アイテムを妖精の窯で合成した結果を、スキーマ通りの JSON で答えて。' },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.9,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            description: { type: 'STRING' },
            category: { type: 'STRING', enum: [...CATEGORY_VALUES] },
            rarity: { type: 'STRING', enum: [...RARITY_VALUES] },
          },
          required: ['name', 'description', 'category', 'rarity'],
        },
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Gemini API エラー (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    )
  }

  const data = (await res.json()) as GeminiResponse
  const raw =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? ''

  if (!raw) {
    const reason = data.promptFeedback?.blockReason
    throw new Error(
      reason ? `合成情報がブロックされました (${reason})` : '合成アイテム情報を取得できませんでした',
    )
  }

  let parsed: Partial<ItemMeta>
  try {
    parsed = JSON.parse(stripCodeFence(raw)) as Partial<ItemMeta>
  } catch {
    throw new Error('合成アイテム情報の JSON 解析に失敗しました')
  }

  const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : ''
  if (!name || !description) {
    throw new Error('合成アイテムの名前または説明が空でした')
  }

  const rarity =
    typeof parsed.rarity === 'string' && (RARITY_VALUES as readonly string[]).includes(parsed.rarity)
      ? (parsed.rarity as Rarity)
      : undefined
  // enum 強制でも保険として検証し、外れていれば other に倒す（rarity と同方式）。
  const category: ItemCategoryKey =
    typeof parsed.category === 'string' && (CATEGORY_VALUES as readonly string[]).includes(parsed.category)
      ? (parsed.category as ItemCategoryKey)
      : 'other'

  return { name, description, category, rarity }
}

/** 図鑑（Seek 型）で同定した写真の主役。bbox はクライアントのクロップに使う。 */
export interface IdentifiedSubject {
  name: string
  /** デデュープ用の安定スラッグ（小文字英字/ローマ字の一般名・単数） */
  speciesKey: string
  category: ItemCategoryKey
  rarity?: Rarity
  /** 主役を囲む矩形 [ymin, xmin, ymax, xmax]（0–1000 正規化） */
  bbox: [number, number, number, number]
}

export interface IdentifyResult {
  /** 撮った瞬間のコレットのひとこと（図鑑エントリの解説にも流用） */
  comment: string
  emotion: ChatEmotion
  /** 収集対象になる主役。景色だけ・不鮮明・対象なしのときは null */
  subject: IdentifiedSubject | null
}

interface GenerateIdentifyArgs {
  apiKey: string
  /** persona を前置きした図鑑同定用 system prompt（buildIdentifySystemPrompt） */
  systemPrompt: string
  /** カメラで撮った写真 */
  image: InlineImage
}

/** raw な subject 候補を検証して IdentifiedSubject | null に正規化する。 */
function normalizeSubject(raw: unknown): IdentifiedSubject | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const name = typeof s.name === 'string' ? s.name.trim() : ''
  const speciesKey = typeof s.speciesKey === 'string' ? s.speciesKey.trim().toLowerCase() : ''
  if (!name || !speciesKey) return null

  const bbox = Array.isArray(s.bbox) ? s.bbox.map((n) => Number(n)) : []
  if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) return null

  const category: ItemCategoryKey =
    typeof s.category === 'string' && (CATEGORY_VALUES as readonly string[]).includes(s.category)
      ? (s.category as ItemCategoryKey)
      : 'other'
  const rarity =
    typeof s.rarity === 'string' && (RARITY_VALUES as readonly string[]).includes(s.rarity)
      ? (s.rarity as Rarity)
      : undefined

  return {
    name,
    speciesKey,
    category,
    rarity,
    bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
  }
}

/**
 * 撮影画像（＋persona）から、コレットのひとこと＋感情＋写っている主役（名前/種キー/カテゴリ/レア度/bbox）
 * を JSON で生成する（図鑑＝Seek 型）。画像生成はしない＝安価な vision 呼び出し。
 */
export async function identifySubject({
  apiKey,
  systemPrompt,
  image,
}: GenerateIdentifyArgs): Promise<IdentifyResult> {
  const model = process.env.GEMINI_TEXT_MODEL || DEFAULT_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'この写真を見て、写っている主役を1つ同定して、スキーマ通りの JSON で答えて。' },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            comment: { type: 'STRING', description: '写っているものへのひとこと（口調はペルソナに従う・1文）' },
            emotion: {
              type: 'STRING',
              enum: [...CHAT_EMOTIONS],
              description: 'ペルソナの「感情の出し方」を参考に、反応に最も合う感情を1つだけ選ぶ',
            },
            subject: {
              type: 'OBJECT',
              nullable: true,
              description: '写真の主役。収集対象が無い/不鮮明なら null',
              properties: {
                name: { type: 'STRING', description: '分かりやすい日本語の一般名' },
                speciesKey: { type: 'STRING', description: 'デデュープ用の英字スラッグ（一般名・単数・形容詞なし）' },
                category: { type: 'STRING', enum: [...CATEGORY_VALUES] },
                rarity: { type: 'STRING', enum: [...RARITY_VALUES] },
                bbox: {
                  type: 'ARRAY',
                  description: '[ymin, xmin, ymax, xmax]（左上0〜右下1000で正規化）',
                  items: { type: 'NUMBER' },
                },
              },
              required: ['name', 'speciesKey', 'category', 'bbox'],
            },
          },
          required: ['comment', 'emotion'],
        },
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini API エラー (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }

  const data = (await res.json()) as GeminiResponse
  const candidate = data.candidates?.[0]
  const raw = candidate?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? ''

  if (!raw) {
    const reason = data.promptFeedback?.blockReason
    throw new Error(
      reason ? `判定がブロックされました (${reason})` : '写真の判定結果を取得できませんでした',
    )
  }

  let parsed: { comment?: unknown; emotion?: unknown; subject?: unknown }
  try {
    parsed = JSON.parse(stripCodeFence(raw)) as typeof parsed
  } catch {
    const truncated = candidate?.finishReason === 'MAX_TOKENS'
    throw new Error(
      truncated ? '判定結果が長すぎて途切れました（もう一度試してね）' : '写真の判定結果の JSON 解析に失敗しました',
    )
  }

  const comment = typeof parsed.comment === 'string' ? parsed.comment.trim() : ''
  if (!comment) {
    throw new Error('コレットのひとことが空でした')
  }

  const emotion =
    typeof parsed.emotion === 'string' && (CHAT_EMOTIONS as readonly string[]).includes(parsed.emotion)
      ? (parsed.emotion as ChatEmotion)
      : 'neutral'

  return { comment, emotion, subject: normalizeSubject(parsed.subject) }
}

export interface SceneComment {
  comment: string
  emotion: ChatEmotion
}

interface GenerateSceneArgs {
  apiKey: string
  /** persona を前置きした風景コメント用 system prompt（buildSceneSystemPrompt） */
  systemPrompt: string
  /** いま見せている景色の撮影画像 */
  image: InlineImage
}

/** 撮影画像（＋persona）から、妖精のひとこと風景コメントと感情を JSON で生成する（図鑑には残さない）。 */
export async function generateSceneComment({
  apiKey,
  systemPrompt,
  image,
}: GenerateSceneArgs): Promise<SceneComment> {
  const model = process.env.GEMINI_TEXT_MODEL || DEFAULT_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'この景色を見て、相棒としてひとことコメントして。スキーマ通りの JSON で答えて。' },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.9,
        // 推論不要。短いひとことなので出力も小さめでよい。
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 256,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            comment: { type: 'STRING', description: '景色へのひとこと（口調はペルソナに従う・1文）' },
            emotion: {
              type: 'STRING',
              enum: [...CHAT_EMOTIONS],
              description: 'ペルソナの「感情の出し方」を参考に、コメントに最も合う感情を1つだけ選ぶ',
            },
          },
          required: ['comment', 'emotion'],
        },
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini API エラー (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }

  const data = (await res.json()) as GeminiResponse
  const candidate = data.candidates?.[0]
  const raw = candidate?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? ''

  if (!raw) {
    const reason = data.promptFeedback?.blockReason
    throw new Error(
      reason ? `コメントがブロックされました (${reason})` : '風景コメントを取得できませんでした',
    )
  }

  let parsed: Partial<SceneComment>
  try {
    parsed = JSON.parse(stripCodeFence(raw)) as Partial<SceneComment>
  } catch {
    const truncated = candidate?.finishReason === 'MAX_TOKENS'
    throw new Error(
      truncated ? 'コメントが長すぎて途切れました（もう一度試してね）' : '風景コメントの JSON 解析に失敗しました',
    )
  }

  const comment = typeof parsed.comment === 'string' ? parsed.comment.trim() : ''
  if (!comment) {
    throw new Error('風景コメントが空でした')
  }

  const emotion =
    typeof parsed.emotion === 'string' && (CHAT_EMOTIONS as readonly string[]).includes(parsed.emotion)
      ? (parsed.emotion as ChatEmotion)
      : 'neutral'

  return { comment, emotion }
}
