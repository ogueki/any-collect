/**
 * Gemini（テキスト/マルチモーダル）呼び出し。モデル固有の実装はこのファイルに閉じ込める。
 * 将来 Claude へ差し替える場合は `claude.ts` を足して chat.ts の import を切り替えるだけにする
 * （claude.md 原則2：具体実装に直接依存しない）。
 *
 * 追加依存を避けるため SDK ではなく Node18+ の global fetch で REST を叩く。
 */

import type { InlineImage } from './gemini-image'
import { RARITY_VALUES, type Rarity } from './item-prompt'

const DEFAULT_MODEL = 'gemini-2.5-flash'

export interface ChatTurn {
  role: 'user' | 'fairy'
  content: string
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
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  promptFeedback?: { blockReason?: string }
}

/** 会話履歴＋ユーザー入力から妖精の応答テキストを生成する。 */
export async function generateChatReply({
  apiKey,
  systemPrompt,
  history,
  userInput,
}: GenerateArgs): Promise<string> {
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
      generationConfig: { temperature: 0.9, topP: 0.95, maxOutputTokens: 256 },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini API エラー (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }

  const data = (await res.json()) as GeminiResponse
  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? ''

  if (!text) {
    const reason = data.promptFeedback?.blockReason
    throw new Error(
      reason ? `応答がブロックされました (${reason})` : '妖精の返事を取得できませんでした',
    )
  }

  return text
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
