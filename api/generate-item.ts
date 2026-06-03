import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadPersona } from './_lib/persona'
import { buildItemImagePrompt, buildItemMetaPrompt } from './_lib/item-prompt'
import { generateItemImage, type InlineImage } from './_lib/gemini-image'
import { generateItemMeta } from './_lib/gemini'

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
    // 画像生成とメタ生成は互いに独立なので並列実行（どちらも元写真だけが入力）。
    const [imageUrl, meta] = await Promise.all([
      generateItemImage({ apiKey, prompt: buildItemImagePrompt(), image }),
      generateItemMeta({ apiKey, systemPrompt: buildItemMetaPrompt(persona), image }),
    ])

    sendJson(res, 200, {
      imageUrl,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      rarity: meta.rarity,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'アイテムの生成に失敗しました'
    sendJson(res, 502, { error: message })
  }
}
