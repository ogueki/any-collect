import type { ServerResponse } from 'node:http'
import { loadVoice, resolveVoice } from './_lib/voice.js'
import {
  fail,
  PayloadTooLargeError,
  readJsonBody,
  rejectForeignOrigin,
  sanitizePersonaId,
  sendJson,
  type NodeReq,
} from './_lib/http.js'

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

/** 演出指示の最大長。長い指示は本文より目立って不安定になるので切る。 */
const MAX_DIRECTION_LEN = 60

interface TtsRequestBody {
  text?: string
  personaId?: string
  /** 立ち絵と同じ感情（FairyExpression）。voice.json の対応表でタグ／声に変換する。 */
  expression?: string
  /**
   * その返事だけの演出指示（AI 生成・日本語の自由文）。あれば感情別の固定タグより優先する。
   * LLM 由来の自由文なので、ここで必ずサニタイズしてから読み上げ文に混ぜる。
   */
  direction?: string
}

/**
 * AI が書いた演出指示を安全な形に整える。
 * 角括弧を除去（タグの入れ子・脱出を防ぐ）・改行を潰す・長さを制限する。
 * 空になったら undefined＝呼び出し側は固定タグにフォールバックする。
 */
function sanitizeDirection(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const cleaned = raw
    .replace(/[[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DIRECTION_LEN)
  return cleaned || undefined
}

/**
 * 読み上げ本文の正規化。**本文にも角括弧を残さない**＝ここに `[...]` が混ざると
 * Fish が感情タグとして解釈してしまう（演出指示側は `sanitizeDirection` で潰しているのに
 * 本文だけ素通しだと、AI の返事に括弧が出た瞬間に意図しないタグ注入になる）。
 */
function sanitizeSpokenText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/[[\]]/g, '').trim().slice(0, MAX_TEXT_LEN)
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
  if (rejectForeignOrigin(req, res)) return

  const apiKey = process.env.FISH_AUDIO_API_KEY
  if (!apiKey) {
    fail(res, 500, 'サーバの設定が不足しています', 'FISH_AUDIO_API_KEY が未設定')
    return
  }

  let body: TtsRequestBody
  try {
    body = await readJsonBody<TtsRequestBody>(req)
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      sendJson(res, 413, { error: 'リクエストが大きすぎます' })
      return
    }
    sendJson(res, 400, { error: 'リクエストボディが不正です' })
    return
  }

  const text = sanitizeSpokenText(body.text)
  if (!text) {
    sendJson(res, 400, { error: 'text が空です' })
    return
  }

  try {
    const voice = loadVoice(sanitizePersonaId(body.personaId))
    // 立ち絵と同じ感情から「使う声」と「前置するタグ」を決める（対応表は voice.json）。
    const { referenceId, tag } = resolveVoice(
      voice,
      typeof body.expression === 'string' ? body.expression : undefined,
    )
    // その返事だけの演出指示があればそれを優先し、無ければ感情別の固定タグに落とす。
    // ＝AI の機微（例「悲しいけど励ましたい」）を活かしつつ、下限は必ず担保する。
    const direction = sanitizeDirection(body.direction)
    const prefix = direction ? `[${direction}]` : tag
    // タグは slice の後に前置する（先に付けるとタグ自体が切り落とされうる）。
    // 表示テキストには混ぜない＝ここ（TTS 経路）だけで付ける。
    const spokenText = prefix ? `${prefix} ${text}` : text

    const fishRes = await fetch(FISH_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Fish はモデルをヘッダで受ける（例: s2.1-pro-free / s2-pro）。
        model: voice.model,
      },
      // reference_id が undefined のときは JSON から自然に落ちる（Fish 既定話者）。
      // latency:'low'＝発話開始（TTFA）優先。音質は既定 mp3_bitrate のまま落とさない。
      body: JSON.stringify({
        text: spokenText,
        reference_id: referenceId,
        format: voice.format,
        latency: 'low',
      }),
    })

    if (!fishRes.ok) {
      // Fish の生レスポンスはアカウント・課金状態を含みうるのでサーバログにだけ出す。
      const detail = await fishRes.text().catch(() => '')
      fail(res, 502, '音声合成に失敗しました', `Fish ${fishRes.status}: ${detail.slice(0, 500)}`)
      return
    }

    // Fish の音声をバッファし切らず、届いたチャンクからそのままクライアントへ流す（低レイテンシ）。
    // Content-Length を付けない＝chunked transfer。クライアントは MediaSource で逐次再生できる。
    res.statusCode = 200
    res.setHeader('Content-Type', audioContentType(voice.format))
    res.setHeader('Cache-Control', 'no-store')

    const stream = fishRes.body
    if (!stream) {
      // ストリームが取れない環境では従来どおり全バッファで返す（保険）。
      res.end(Buffer.from(await fishRes.arrayBuffer()))
      return
    }
    const reader = stream.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) res.write(Buffer.from(value))
      }
    } catch {
      // 途中で切れても既に 200/ヘッダ送信済み＝ここでは終了だけ（クライアント側で握りつぶす）。
    } finally {
      res.end()
    }
  } catch (err) {
    // ヘッダ送信前の失敗のみ JSON エラーにできる（送信後は fail() が res.end() だけする）。
    fail(res, 502, '音声合成に失敗しました', err)
  }
}
