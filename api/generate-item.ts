import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadPersona } from './_lib/persona.js'
import { buildItemImagePrompt, buildItemMetaPrompt, ITEM_NEGATIVE_PROMPT } from './_lib/item-prompt.js'
import type { InlineImage } from './_lib/gemini-image.js'
import { generateItemImage as generateGeminiImage } from './_lib/gemini-image.js'
import { generateItemImage as generateFalImage } from './_lib/fal-image.js'
import { generateItemMeta } from './_lib/gemini.js'

/**
 * 撮影→アイテム化 API プロキシ（STEP3 の核）。
 * 受け取った撮影画像から「統一絵柄のアイコン＋名前＋説明＋カテゴリ＋レア度」を生成して返す。
 *
 * - 絵柄統一・命名は _lib/item-prompt.ts の共通プロンプトを唯一の基準にする。
 * - Gemini の API キーはサーバ側のみ（claude.md 原則1）。
 * - 元写真は保存しない。生成が終わればこのリクエストとともに破棄される（プライバシー方針）。
 *
 * Node 素の (req, res) ハンドラ。本番は Vercel Function、dev は vite の apiDevServer で同一コードが動く。
 */

interface GenerateItemRequestBody {
  /** data URL（例: 'data:image/jpeg;base64,...'） */
  image?: string
  personaId?: string
}

type NodeReq = IncomingMessage & { body?: unknown }

async function readJsonBody(req: NodeReq): Promise<GenerateItemRequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as GenerateItemRequestBody
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? (JSON.parse(raw) as GenerateItemRequestBody) : {}
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/** 'data:image/jpeg;base64,XXXX' を { mimeType, data } に分解する。 */
function parseDataUrl(dataUrl: string): InlineImage | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

/**
 * 各 AI 呼び出しの所要時間を dev コンソールに出す（スキャン高速化の検証用）。
 * warm 実測＆ Gemini↔fal の比較を数値で取るための軽量計測。本採用が決まったら外してよい。
 */
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  try {
    return await fn()
  } finally {
    console.log(`[generate-item] ${label}: ${Date.now() - start}ms`)
  }
}

export default async function handler(req: NodeReq, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'POST のみ対応しています' })
    return
  }

  // メタ生成（名前/説明/カテゴリ/レア度）は常に Gemini なので GEMINI_API_KEY は必須。
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    sendJson(res, 500, { error: 'サーバに GEMINI_API_KEY が設定されていません' })
    return
  }

  // 画像生成プロバイダを env で選択（既定 Gemini／'fal' で高速モデル試験）。
  const imageProvider = (process.env.IMAGE_PROVIDER || 'gemini').toLowerCase()
  const falKey = process.env.FAL_KEY
  if (imageProvider === 'fal' && !falKey) {
    sendJson(res, 500, { error: 'IMAGE_PROVIDER=fal ですが FAL_KEY が設定されていません' })
    return
  }

  let body: GenerateItemRequestBody
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const image = typeof body.image === 'string' ? parseDataUrl(body.image) : null
  if (!image) {
    sendJson(res, 400, { error: '撮影画像（image: data URL）が不正です' })
    return
  }

  try {
    const persona = loadPersona(body.personaId)
    // 画像生成: プロバイダを env で切替（既定 Gemini／fal は高速 img2img・鍵が別）。
    const runImage = (): Promise<string> =>
      imageProvider === 'fal'
        ? generateFalImage({
            apiKey: falKey as string,
            prompt: buildItemImagePrompt(),
            negativePrompt: ITEM_NEGATIVE_PROMPT,
            image,
          })
        : generateGeminiImage({ apiKey, prompt: buildItemImagePrompt(), image })

    // 画像生成とメタ生成は互いに独立なので並列実行（どちらも元写真だけが入力）。
    const [imageUrl, meta] = await Promise.all([
      timed(`image(${imageProvider})`, runImage),
      timed('meta(gemini)', () =>
        generateItemMeta({ apiKey, systemPrompt: buildItemMetaPrompt(persona), image }),
      ),
    ])

    sendJson(res, 200, {
      imageUrl,
      name: meta.name,
      description: meta.description,
      category: meta.category,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'アイテムの生成に失敗しました'
    sendJson(res, 502, { error: message })
  }
}
