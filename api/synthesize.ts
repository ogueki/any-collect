import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadPersona } from './_lib/persona.js'
import { buildSynthesisImagePrompt, buildSynthesisMetaPrompt } from './_lib/item-prompt.js'
import type { InlineImage } from './_lib/gemini-image.js'
import { generateSynthesisImage } from './_lib/gemini-image.js'
import { generateSynthesisMeta } from './_lib/gemini.js'

interface ItemInput {
  imageUrl?: string
  name?: string
  description?: string
}

interface SynthesizeRequestBody {
  itemA?: ItemInput
  itemB?: ItemInput
  personaId?: string
}

type NodeReq = IncomingMessage & { body?: unknown }

async function readJsonBody(req: NodeReq): Promise<SynthesizeRequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as SynthesizeRequestBody
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? (JSON.parse(raw) as SynthesizeRequestBody) : {}
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function parseDataUrl(dataUrl: string): InlineImage | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  try {
    return await fn()
  } finally {
    console.log(`[synthesize] ${label}: ${Date.now() - start}ms`)
  }
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

  let body: SynthesizeRequestBody
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const rawA = body.itemA
  const rawB = body.itemB
  if (!rawA?.imageUrl || !rawA.name || !rawA.description) {
    sendJson(res, 400, { error: '素材A（imageUrl, name, description）が不足しています' })
    return
  }
  if (!rawB?.imageUrl || !rawB.name || !rawB.description) {
    sendJson(res, 400, { error: '素材B（imageUrl, name, description）が不足しています' })
    return
  }

  const nameA = rawA.name
  const nameB = rawB.name
  const descA = rawA.description
  const descB = rawB.description

  const imageA = parseDataUrl(rawA.imageUrl)
  const imageB = parseDataUrl(rawB.imageUrl)
  if (!imageA || !imageB) {
    sendJson(res, 400, { error: 'アイテム画像（data URL）が不正です' })
    return
  }

  try {
    const persona = loadPersona(body.personaId)

    const [imageUrl, meta] = await Promise.all([
      timed('image', () =>
        generateSynthesisImage({
          apiKey,
          prompt: buildSynthesisImagePrompt(nameA, nameB),
          imageA,
          imageB,
        }),
      ),
      timed('meta', () =>
        generateSynthesisMeta({
          apiKey,
          systemPrompt: buildSynthesisMetaPrompt(persona, {
            name: nameA,
            description: descA,
          }, {
            name: nameB,
            description: descB,
          }),
        }),
      ),
    ])

    sendJson(res, 200, {
      imageUrl,
      name: meta.name,
      description: meta.description,
      category: meta.category,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'アイテムの合成に失敗しました'
    sendJson(res, 502, { error: message })
  }
}
