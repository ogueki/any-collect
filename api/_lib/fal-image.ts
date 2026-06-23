/**
 * fal.ai（高速画像生成・img2img）呼び出し。モデル固有の実装をこのファイルに閉じ込める
 * （claude.md 原則2：具体実装に直接依存しない）。gemini-image.ts と同じ「data URL を返す」
 * 契約を守ることで、generate-item.ts はプロバイダ名で関数を差し替えるだけで済む。
 *
 * 目的はスキャン速度・コストの検証（Gemini 2.5 Flash Image との A/B）。
 * 追加依存を避けるため fal SDK ではなく Node18+ の global fetch で REST を叩く
 * （gemini-image.ts / gemini.ts と同方針＝npm 依存を増やさない＝あとで跡形なく戻せる）。
 *
 * API キーは呼び出し元（Vercel Functions）から渡す。クライアントには出さない（原則1）。
 */

import type { InlineImage } from './gemini-image.js'

// 既定は「実物を活かす restyle」に向く高速 img2img モデル。
// FAL_IMAGE_MODEL で FLUX Kontext 等の忠実度寄りモデルへ env だけで差し替え可能。
const DEFAULT_FAL_MODEL = 'fal-ai/fast-sdxl/image-to-image'
// img2img の効き具合（0=元写真のまま / 1=プロンプト優先で別物化）。忠実↔リスタイルの調整つまみ。
const DEFAULT_STRENGTH = 0.6

interface GenerateImageArgs {
  apiKey: string
  prompt: string
  /** SDXL/Lightning 系で効くネガティブプロンプト（FLUX 系では空でも可） */
  negativePrompt?: string
  /** 元になる撮影画像 */
  image: InlineImage
}

interface FalImage {
  url?: string
  /** 一部モデルは data URI / base64 を返す場合がある */
  content_type?: string
}

interface FalImageResponse {
  images?: FalImage[]
  /** 一部モデルは単数 image を返す */
  image?: FalImage
  detail?: unknown
}

/** 0〜1 にクランプした strength を返す（不正な env 値は既定に丸める）。 */
function resolveStrength(): number {
  const raw = process.env.FAL_IMG2IMG_STRENGTH
  if (!raw) return DEFAULT_STRENGTH
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_STRENGTH
  return Math.min(1, Math.max(0, n))
}

/** fal が返した画像 URL を取り出す（images[] / image のどちらでも拾う）。 */
function pickImageUrl(data: FalImageResponse): string | undefined {
  return data.images?.find((i) => i.url)?.url ?? data.image?.url
}

/** リモート画像（fal ホスト URL）を取得して data URL 化する。図鑑保存を自己完結にするため。 */
async function toDataUrl(remoteUrl: string): Promise<string> {
  // すでに data URL ならそのまま使う。
  if (remoteUrl.startsWith('data:')) return remoteUrl
  const res = await fetch(remoteUrl)
  if (!res.ok) {
    throw new Error(`生成画像の取得に失敗しました (${res.status})`)
  }
  const mimeType = res.headers.get('content-type') || 'image/png'
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:${mimeType};base64,${buf.toString('base64')}`
}

/** 撮影画像＋プロンプトから、fal の高速モデルでアイテムアイコンを生成して data URL で返す。 */
export async function generateItemImage({
  apiKey,
  prompt,
  negativePrompt,
  image,
}: GenerateImageArgs): Promise<string> {
  const model = process.env.FAL_IMAGE_MODEL || DEFAULT_FAL_MODEL
  const url = `https://fal.run/${model}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      negative_prompt: negativePrompt ?? '',
      // 元写真を data URI で渡す（img2img の条件画像）。fal は data URI を受け付ける。
      image_url: `data:${image.mimeType};base64,${image.data}`,
      strength: resolveStrength(),
      // 正方形アイコン。高速モデルは少ステップで十分速い。
      image_size: 'square',
      num_images: 1,
      enable_safety_checker: true,
      sync_mode: true,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `fal 画像API エラー (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    )
  }

  const data = (await res.json()) as FalImageResponse
  const remoteUrl = pickImageUrl(data)
  if (!remoteUrl) {
    throw new Error('アイコン画像を生成できませんでした（fal 応答に画像がありません）')
  }

  return toDataUrl(remoteUrl)
}
