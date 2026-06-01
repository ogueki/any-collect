import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 選択中キャラの persona.md を読み込み、会話用の system prompt を組み立てるユーティリティ。
 * `_` 接頭辞ディレクトリは Vercel のルーティング対象外（＝import 専用）。
 *
 * すべての AI 呼び出しはこの persona を唯一の基準として口調・性格を統一する（claude.md 原則3）。
 */

// persona.md がどうしても読めない場合の最終フォールバック。
const FALLBACK_PERSONA = `# 妖精ペルソナ
- やわらかいフレンドリーなタメ口で短く話す、好奇心旺盛な手のひらサイズの妖精。`

/** `src/characters/<id>/persona.md` を読む。無ければ default → フォールバックの順に降りる。 */
export function loadPersona(personaId?: string): string {
  const id = personaId && personaId.trim() ? personaId.trim() : 'default'

  const read = (charId: string): string | null => {
    try {
      return readFileSync(
        resolve(process.cwd(), 'src', 'characters', charId, 'persona.md'),
        'utf8',
      )
    } catch {
      return null
    }
  }

  return read(id) ?? (id !== 'default' ? read('default') : null) ?? FALLBACK_PERSONA
}

/** persona 本文に会話ルールを前置きして system prompt を作る。 */
export function buildSystemPrompt(personaText: string): string {
  return [
    'あなたは以下のペルソナを持つ妖精キャラクターとして、ユーザーと日本語で会話します。',
    '次のルールを必ず守ってください。',
    '- ペルソナの口調・性格・一人称/二人称を厳密に守る。',
    '- 1回の返答は2〜3文の短さにおさめる。',
    '- 絵文字は使わない。',
    '- 地の文のプレーンテキストで返す（Markdown記法・箇条書き・コードブロックは使わない）。',
    '- キャラクターを崩さない（AIやシステムであることに言及しない）。',
    '',
    '# ペルソナ定義',
    personaText.trim(),
  ].join('\n')
}
