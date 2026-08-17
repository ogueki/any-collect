import type { ServerResponse } from 'node:http'
import { loadPersona } from './_lib/persona.js'
import { buildItemImagePrompt, buildItemMetaPrompt, ITEM_NEGATIVE_PROMPT } from './_lib/item-prompt.js'
import { generateItemImage as generateGeminiImage } from './_lib/gemini-image.js'
import { generateItemImage as generateFalImage } from './_lib/fal-image.js'
import { generateItemMeta } from './_lib/gemini.js'
import {
  fail,
  isImageWithinLimit,
  parseImageDataUrl,
  PayloadTooLargeError,
  readJsonBody,
  rejectForeignOrigin,
  sanitizePersonaId,
  sendJson,
  timed,
  type NodeReq,
} from './_lib/http.js'

/**
 * 召喚 API プロキシ（図鑑エントリのクロップ → 透過アイテム）。
 * 受け取った画像から「統一絵柄のアイコン＋名前＋説明＋カテゴリ＋コレットのひとこと」を生成して返す。
 *
 * - 絵柄統一・命名は _lib/item-prompt.ts の共通プロンプトを唯一の基準にする。
 * - Gemini の API キーはサーバ側のみ（claude.md 原則1）。
 * - 元写真は保存しない。生成が終わればこのリクエストとともに破棄される（プライバシー方針）。
 * - **1 回あたり画像生成コストが発生する**（呼び出し回数の制限は未実装＝仕様待ち）。
 *
 * Node 素の (req, res) ハンドラ。本番は Vercel Function、dev は vite の apiDevServer で同一コードが動く。
 */

interface GenerateItemRequestBody {
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

  // メタ生成（名前/説明/カテゴリ）は常に Gemini なので GEMINI_API_KEY は必須。
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    fail(res, 500, 'サーバの設定が不足しています', 'GEMINI_API_KEY が未設定')
    return
  }

  // 画像生成プロバイダを env で選択（既定 Gemini／'fal' で高速モデル試験）。
  const imageProvider = (process.env.IMAGE_PROVIDER || 'gemini').toLowerCase()
  const falKey = process.env.FAL_KEY
  if (imageProvider === 'fal' && !falKey) {
    fail(res, 500, 'サーバの設定が不足しています', 'IMAGE_PROVIDER=fal だが FAL_KEY が未設定')
    return
  }

  let body: GenerateItemRequestBody
  try {
    body = await readJsonBody<GenerateItemRequestBody>(req)
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
    sendJson(res, 400, { error: '撮影画像（image: data URL）が不正です' })
    return
  }
  if (!isImageWithinLimit(image.data)) {
    sendJson(res, 413, { error: '画像が大きすぎます' })
    return
  }

  try {
    const persona = loadPersona(sanitizePersonaId(body.personaId))
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
      timed(`generate-item image(${imageProvider})`, runImage),
      timed('generate-item meta(gemini)', () =>
        generateItemMeta({ apiKey, systemPrompt: buildItemMetaPrompt(persona), image }),
      ),
    ])

    sendJson(res, 200, {
      imageUrl,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      // 召喚直後にホームでコレットが言うひとこと。メタ生成に相乗りしているので追加コストは無い。
      comment: meta.comment,
    })
  } catch (err) {
    fail(res, 502, 'アイテムの生成に失敗しました', err)
  }
}
