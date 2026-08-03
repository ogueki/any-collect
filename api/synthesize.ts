import type { ServerResponse } from 'node:http'
import { loadPersona } from './_lib/persona.js'
import { buildSynthesisImagePrompt, buildSynthesisMetaPrompt } from './_lib/item-prompt.js'
import { generateSynthesisImage } from './_lib/gemini-image.js'
import { generateSynthesisMeta } from './_lib/gemini.js'
import {
  fail,
  isImageWithinLimit,
  parseImageDataUrl,
  PayloadTooLargeError,
  readJsonBody,
  sanitizePersonaId,
  sanitizeText,
  sendJson,
  timed,
  type NodeReq,
} from './_lib/http.js'

/**
 * 妖精の窯（合成）API プロキシ。アイテム 2 つを混ぜて新しい透過アイテムを作る。
 *
 * - **1 回あたり画像生成コストが発生する**（呼び出し回数の制限は未実装＝仕様待ち）。
 * - 素材の名前・説明は**クライアント由来の自由文字列がそのままプロンプトに載る**ため、
 *   制御文字を潰し長さで切ってから使う（プロンプトの構造を壊させない）。
 */

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

/** 素材名・説明の上限（正常系＝AI が生成した短い名前/説明なので遠く及ばない）。 */
const MAX_NAME_LEN = 60
const MAX_DESCRIPTION_LEN = 400

export default async function handler(req: NodeReq, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'POST のみ対応しています' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    fail(res, 500, 'サーバの設定が不足しています', 'GEMINI_API_KEY が未設定')
    return
  }

  let body: SynthesizeRequestBody
  try {
    body = await readJsonBody<SynthesizeRequestBody>(req)
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      sendJson(res, 413, { error: 'リクエストが大きすぎます' })
      return
    }
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const nameA = sanitizeText(body.itemA?.name, MAX_NAME_LEN)
  const descA = sanitizeText(body.itemA?.description, MAX_DESCRIPTION_LEN)
  const nameB = sanitizeText(body.itemB?.name, MAX_NAME_LEN)
  const descB = sanitizeText(body.itemB?.description, MAX_DESCRIPTION_LEN)

  if (!body.itemA?.imageUrl || !nameA || !descA) {
    sendJson(res, 400, { error: '素材A（imageUrl, name, description）が不足しています' })
    return
  }
  if (!body.itemB?.imageUrl || !nameB || !descB) {
    sendJson(res, 400, { error: '素材B（imageUrl, name, description）が不足しています' })
    return
  }

  const imageA = parseImageDataUrl(body.itemA.imageUrl)
  const imageB = parseImageDataUrl(body.itemB.imageUrl)
  if (!imageA || !imageB) {
    sendJson(res, 400, { error: 'アイテム画像（data URL）が不正です' })
    return
  }
  if (!isImageWithinLimit(imageA.data) || !isImageWithinLimit(imageB.data)) {
    sendJson(res, 413, { error: 'アイテム画像が大きすぎます' })
    return
  }

  try {
    const persona = loadPersona(sanitizePersonaId(body.personaId))

    const [imageUrl, meta] = await Promise.all([
      timed('synthesize image', () =>
        generateSynthesisImage({
          apiKey,
          prompt: buildSynthesisImagePrompt(nameA, nameB),
          imageA,
          imageB,
        }),
      ),
      timed('synthesize meta', () =>
        generateSynthesisMeta({
          apiKey,
          systemPrompt: buildSynthesisMetaPrompt(
            persona,
            { name: nameA, description: descA },
            { name: nameB, description: descB },
          ),
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
    fail(res, 502, 'アイテムの合成に失敗しました', err)
  }
}
