import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 選択中キャラの voice.json を読み、TTS（Fish Audio）の声設定を返すユーティリティ。
 * `loadPersona`（persona.ts）と同型（`_` 接頭辞ディレクトリは Vercel ルーティング対象外＝import 専用）。
 * 声・モデルの差し替えは voice.json 1つで完結する（コード無改修・claude.md キャラ差し替え単位）。
 */

export interface VoiceConfig {
  /** Fish Audio の音声モデルID（reference_id）。空/未設定なら Fish の既定話者。 */
  referenceId?: string
  /** Fish のモデル（例: 's2.1-pro-free'（無料）/ 's2-pro' / 's2.1-pro'）。 */
  model: string
  /** 出力フォーマット（'mp3' 既定）。 */
  format: string
  /**
   * 感情 → Fish の感情タグ（例: `happy` → `[happy]`）。本文の先頭に前置して読み方を変える。
   * Fish S2 は文頭の文レベル感情キューが最も効く（1文に主要感情1つ）。
   * 未定義の感情はタグなし＝素の声（`neutral` は意図的に未定義にしている）。
   */
  expressionTag?: Record<string, string>
  /** 名前つきの別音声（例: `bright` → 元気テイクのクローン ID）。 */
  variants?: Record<string, string>
  /** 感情 → `variants` のキー。引ければその声を使い、引けなければ `referenceId`。 */
  expressionVariant?: Record<string, string>
}

/** voice.json がどうしても読めない場合の最終フォールバック（無料モデル・既定話者）。 */
const FALLBACK_VOICE: VoiceConfig = { model: 's2.1-pro-free', format: 'mp3' }

/** JSON から「文字列→文字列」の対応表だけを取り出す（値が文字列でないものは捨てる）。 */
function readStringMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim()
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** 感情名として受け付ける形（FairyExpression は小文字英字のみ）。不正な値は無視する。 */
const EXPRESSION_RE = /^[a-z]{1,20}$/

/** 感情から「使う声」と「前置するタグ」を決める純関数（I/O なし）。 */
export function resolveVoice(
  voice: VoiceConfig,
  expression?: string,
): { referenceId?: string; tag?: string } {
  // 未知・不正な感情は素通し（タグなし・既定声）。自由文字列をそのまま TTS に流さない。
  if (!expression || !EXPRESSION_RE.test(expression)) return { referenceId: voice.referenceId }

  const variantKey = voice.expressionVariant?.[expression]
  const variantId = variantKey ? voice.variants?.[variantKey] : undefined

  return {
    referenceId: variantId ?? voice.referenceId,
    tag: voice.expressionTag?.[expression],
  }
}

/** `src/characters/<id>/voice.json` を読む。無ければ default → フォールバックの順に降りる。 */
export function loadVoice(personaId?: string): VoiceConfig {
  const id = personaId && personaId.trim() ? personaId.trim() : 'default'

  const read = (charId: string): VoiceConfig | null => {
    try {
      const raw = readFileSync(
        resolve(process.cwd(), 'src', 'characters', charId, 'voice.json'),
        'utf8',
      )
      const parsed = JSON.parse(raw) as Partial<VoiceConfig>
      return {
        referenceId:
          typeof parsed.referenceId === 'string' && parsed.referenceId.trim()
            ? parsed.referenceId.trim()
            : undefined,
        model:
          typeof parsed.model === 'string' && parsed.model.trim()
            ? parsed.model
            : FALLBACK_VOICE.model,
        format:
          typeof parsed.format === 'string' && parsed.format.trim()
            ? parsed.format
            : FALLBACK_VOICE.format,
        expressionTag: readStringMap(parsed.expressionTag),
        variants: readStringMap(parsed.variants),
        expressionVariant: readStringMap(parsed.expressionVariant),
      }
    } catch {
      return null
    }
  }

  return read(id) ?? (id !== 'default' ? read('default') : null) ?? FALLBACK_VOICE
}
