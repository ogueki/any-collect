/**
 * Gemini（テキスト会話）呼び出し。モデル固有の実装はこのファイルに閉じ込める。
 * 将来 Claude へ差し替える場合は `claude.ts` を足して chat.ts の import を切り替えるだけにする
 * （claude.md 原則2：具体実装に直接依存しない）。
 *
 * 追加依存を避けるため SDK ではなく Node18+ の global fetch で REST を叩く。
 */

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
