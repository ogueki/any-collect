import type { ServerResponse } from 'node:http'
import { loadPersona, buildSceneSystemPrompt } from './_lib/persona.js'
import { generateSceneComment } from './_lib/gemini.js'
import {
  fail,
  isImageWithinLimit,
  parseImageDataUrl,
  PayloadTooLargeError,
  readJsonBody,
  rejectForeignOrigin,
  sanitizePersonaId,
  sendJson,
  type NodeReq,
} from './_lib/http.js'

/**
 * 風景コメント API プロキシ。
 * カメラで見せた景色の画像から、妖精のひとことコメント＋感情を生成して返す。
 *
 * - 図鑑には登録しない「その場の演出」。元写真は保存しない（このリクエストとともに破棄）。
 * - persona を参照して口調を統一（claude.md 原則3）。Gemini の鍵はサーバ側のみ（原則1）。
 *
 * ⚠️ **現在クライアントからの導線はない**（STEP1d で図鑑判定に置き換わった）。
 * 別用途での再利用を見込んで残置しているが、**公開されている＝課金される経路**なので
 * 他のエンドポイントと同じ守り（レート制限・サイズ上限）は必ず通す。
 *
 * Node 素の (req, res) ハンドラ。本番は Vercel Function、dev は vite の apiDevServer で同一コードが動く。
 */

interface DescribeSceneRequestBody {
  /** data URL（例: 'data:image/jpeg;base64,...'） */
  image?: string
  personaId?: string
}

export default async function handler(req: NodeReq, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'POST のみ対応しています' })
    return
  }
  if (rejectForeignOrigin(req, res)) return

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    fail(res, 500, 'サーバの設定が不足しています', 'GEMINI_API_KEY が未設定')
    return
  }

  let body: DescribeSceneRequestBody
  try {
    body = await readJsonBody<DescribeSceneRequestBody>(req)
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      sendJson(res, 413, { error: 'リクエストが大きすぎます' })
      return
    }
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const image = parseImageDataUrl(body.image)
  if (!image) {
    sendJson(res, 400, { error: '景色画像（image: data URL）が不正です' })
    return
  }
  if (!isImageWithinLimit(image.data)) {
    sendJson(res, 413, { error: '画像が大きすぎます' })
    return
  }

  try {
    const systemPrompt = buildSceneSystemPrompt(loadPersona(sanitizePersonaId(body.personaId)))
    const { comment, emotion } = await generateSceneComment({ apiKey, systemPrompt, image })
    sendJson(res, 200, { comment, emotion })
  } catch (err) {
    fail(res, 502, '風景コメントの生成に失敗しました', err)
  }
}
