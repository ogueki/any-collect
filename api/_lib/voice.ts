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
}

/** voice.json がどうしても読めない場合の最終フォールバック（無料モデル・既定話者）。 */
const FALLBACK_VOICE: VoiceConfig = { model: 's2.1-pro-free', format: 'mp3' }

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
      }
    } catch {
      return null
    }
  }

  return read(id) ?? (id !== 'default' ? read('default') : null) ?? FALLBACK_VOICE
}
