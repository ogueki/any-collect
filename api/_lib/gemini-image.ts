/**
 * Gemini 2.5 Flash Image（画像生成・編集）呼び出し。モデル固有の実装をこのファイルに閉じ込める。
 * 将来モデルを差し替える場合もこのファイルだけを直す（claude.md 原則2：具体実装に直接依存しない）。
 *
 * 追加依存を避けるため SDK ではなく Node18+ の global fetch で REST を叩く（gemini.ts と同方針）。
 * API キーは呼び出し元（Vercel Functions）から渡す。クライアントには出さない（原則1）。
 */

const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image'

export interface InlineImage {
  /** base64 本体（data URL 接頭辞は含めない） */
  data: string
  /** 例: 'image/jpeg' */
  mimeType: string
}

interface GenerateImageArgs {
  apiKey: string
  prompt: string
  /** 元になる撮影画像 */
  image: InlineImage
}

interface GeminiPart {
  text?: string
  inlineData?: { mimeType?: string; data?: string }
}

interface GeminiImageResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
}

interface GenerateSynthesisImageArgs {
  apiKey: string
  prompt: string
  imageA: InlineImage
  imageB: InlineImage
}

/** 2つのアイテムアイコンを融合して新アイテムアイコンを生成する（妖精の窯）。 */
export async function generateSynthesisImage({
  apiKey,
  prompt,
  imageA,
  imageB,
}: GenerateSynthesisImageArgs): Promise<string> {
  const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: imageA.mimeType, data: imageA.data } },
            { inlineData: { mimeType: imageB.mimeType, data: imageB.data } },
          ],
        },
      ],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.5 },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Gemini 画像API エラー (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    )
  }

  const data = (await res.json()) as GeminiImageResponse
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData?.data)

  if (!imagePart?.inlineData?.data) {
    const reason = data.promptFeedback?.blockReason
    throw new Error(
      reason
        ? `合成アイコン生成がブロックされました (${reason})`
        : '合成アイコン画像を生成できませんでした',
    )
  }

  const mimeType = imagePart.inlineData.mimeType || 'image/png'
  return `data:${mimeType};base64,${imagePart.inlineData.data}`
}

/** 撮影画像＋プロンプトから、統一絵柄のアイテムアイコンを生成して data URL で返す。 */
export async function generateItemImage({
  apiKey,
  prompt,
  image,
}: GenerateImageArgs): Promise<string> {
  const model = process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        },
      ],
      // 画像モデルは TEXT+IMAGE を返す前提。忠実さ優先で温度は低め（創作的な要素追加を抑制）。
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.25 },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Gemini 画像API エラー (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    )
  }

  const data = (await res.json()) as GeminiImageResponse
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData?.data)

  if (!imagePart?.inlineData?.data) {
    const reason = data.promptFeedback?.blockReason
    throw new Error(
      reason
        ? `アイコン生成がブロックされました (${reason})`
        : 'アイコン画像を生成できませんでした',
    )
  }

  const mimeType = imagePart.inlineData.mimeType || 'image/png'
  return `data:${mimeType};base64,${imagePart.inlineData.data}`
}
