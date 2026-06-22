/**
 * Gemini（テキスト/マルチモーダル）呼び出し。モデル固有の実装はこのファイルに閉じ込める。
 * 将来 Claude へ差し替える場合は `claude.ts` を足して chat.ts の import を切り替えるだけにする
 * （claude.md 原則2：具体実装に直接依存しない）。
 *
 * 追加依存を避けるため SDK ではなく Node18+ の global fetch で REST を叩く。
 */

import type { InlineImage } from './gemini-image.js'
import { RARITY_VALUES, type Rarity } from './item-prompt.js'

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
  category?: string
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
            category: { type: 'STRING' },
            rarity: { type: 'STRING', enum: [...RARITY_VALUES] },
          },
          required: ['name', 'description', 'rarity'],
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
  const category =
    typeof parsed.category === 'string' && parsed.category.trim() ? parsed.category.trim() : undefined

  return { name, description, category, rarity }
}
