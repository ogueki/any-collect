import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadVoice } from './_lib/voice.js'

/**
 * 音声合成 API プロキシ（STEP3・Fish Audio）。
 * テキストを受け取り Fish Audio の TTS で音声にして返す。
 *
 * - Fish の API キーはサーバ側のみ（claude.md 原則1）。フロントから直接 Fish を叩かない。
 * - 声・モデルは選択中キャラの voice.json（loadVoice）で決まる（原則3・キャラ差し替え単位）。
 *
 * Node 素の (req, res) ハンドラ。本番は Vercel Function、dev は vite の apiDevServer で同一コードが動く。
 */

const FISH_TTS_URL = 'https://api.fish.audio/v1/tts'
/** chunk_length（100-300）の上限＝1リクエストの上限。コスト/レイテンシの安全弁。 */
const MAX_TEXT_LEN = 300

interface TtsRequestBody {
  text?: string
  personaId?: string
}

type NodeReq = IncomingMessage & { body?: unknown }

async function readJsonBody(req: NodeReq): Promise<TtsRequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as TtsRequestBody
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? (JSON.parse(raw) as TtsRequestBody) : {}
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function audioContentType(format: string): string {
  switch (format) {
    case 'wav':
      return 'audio/wav'
    case 'opus':
      return 'audio/opus'
    case 'pcm':
      return 'audio/pcm'
    default:
      return 'audio/mpeg'
  }
}

export default async function handler(req: NodeReq, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'POST のみ対応しています' })
    return
  }

  const apiKey = process.env.FISH_AUDIO_API_KEY
  if (!apiKey) {
    sendJson(res, 500, { error: 'サーバに FISH_AUDIO_API_KEY が設定されていません' })
    return
  }

  let body: TtsRequestBody
  try {
    body = await readJsonBody(req)
  } catch {
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT_LEN) : ''
  if (!text) {
    sendJson(res, 400, { error: 'text が空です' })
    return
  }

  try {
    const voice = loadVoice(body.personaId)
    const fishRes = await fetch(FISH_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Fish はモデルをヘッダで受ける（例: s2.1-pro-free / s2-pro）。
        model: voice.model,
      },
      // reference_id が undefined のときは JSON から自然に落ちる（Fish 既定話者）。
      body: JSON.stringify({ text, reference_id: voice.referenceId, format: voice.format }),
    })

    if (!fishRes.ok) {
      const detail = await fishRes.text().catch(() => '')
      sendJson(res, 502, {
        error: `音声合成に失敗しました (${fishRes.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      })
      return
    }

    const buf = Buffer.from(await fishRes.arrayBuffer())
    res.statusCode = 200
    res.setHeader('Content-Type', audioContentType(voice.format))
    res.setHeader('Cache-Control', 'no-store')
    res.end(buf)
  } catch (err) {
    const message = err instanceof Error ? err.message : '音声合成に失敗しました'
    sendJson(res, 502, { error: message })
  }
}
