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

/**
 * 会話に注入する接地文脈（v2・STEP2）。好感度レベル＋記憶（構造化ファクト）。
 * 会話は api/chat.ts でこの context を組み立てて buildSystemPrompt に渡す。
 */
export interface ChatContext {
  /** コレットとの好感度レベル（1..）。persona の「好感度別の口調」tier 選択に使う */
  affinityLevel?: number
  /** コレットが覚えている「きみについての短い事実」（クライアントから注入） */
  memoryFacts?: { key: string; value: string }[]
}

/** persona 本文に会話ルール＋接地文脈を前置きして system prompt を作る。 */
export function buildSystemPrompt(personaText: string, context?: ChatContext): string {
  const lines = [
    'あなたは以下のペルソナを持つ妖精キャラクターとして、ユーザーと日本語で会話します。',
    '次のルールを必ず守ってください。',
    '- ペルソナの口調・性格・一人称/二人称を厳密に守る。',
    '- 1回の返答は2〜3文の短さにおさめる。',
    '- 絵文字は使わない。',
    '- 地の文のプレーンテキストで返す（Markdown記法・箇条書き・コードブロックは使わない）。',
    '- キャラクターを崩さない（AIやシステムであることに言及しない）。',
  ]

  if (context?.affinityLevel && context.affinityLevel >= 1) {
    lines.push(
      `- 現在のコレットとの好感度レベルは ${context.affinityLevel} です。ペルソナ定義の「好感度別の口調」のうち、このレベルに対応する距離感で話してください（レベルやシステムの話には触れない）。`,
    )
  }

  const facts = (context?.memoryFacts ?? []).filter((f) => f && f.key && f.value)
  if (facts.length > 0) {
    lines.push(
      '',
      '# コレットが覚えていること（きみについて）',
      ...facts.map((f) => `- ${f.key}: ${f.value}`),
      '',
      '記憶の扱い（必ず守る）:',
      '- 関連する話題のときは、覚えていることに自然に触れてよい（名前で呼ぶ・好きなものの話をする等）。ただし一度に並べ立てない。',
      '- 確信が持てないことは断定せず「たしか〜だよね?」のように暫定的に確認する。訂正されたら素直に受け入れる（言い張らない）。',
      '- 覚えていないことを、覚えているかのように作り話しない。',
    )
  }

  lines.push('', '# ペルソナ定義', personaText.trim())
  return lines.join('\n')
}

/**
 * 記憶の要約（/api/memory）用の system prompt。persona 非依存の中立な抽出器。
 * 会話から「相手についての覚えておくべき短い事実」を抽出/更新する（コレットの口調は使わない）。
 */
export function buildMemorySystemPrompt(): string {
  return [
    'あなたは会話アシスタントの「記憶係」です。ユーザー（きみ）とキャラクター（コレット）の会話から、',
    'コレットが今後の会話で覚えておくと良い「きみ（ユーザー）についての短い事実」を抽出・更新します。',
    '',
    '出力ルール:',
    '- 既存の「いま覚えていること」を踏まえ、直近の会話で分かったことを反映した【更新後の全リスト】を返す（差分ではなく全部）。',
    '- 各 fact は { key: 種類, value: 短い内容(1文以内) }。key の例: 呼び名 / 好き / 苦手 / 話題 / 出来事 / 目標。',
    '- 会話で【明示されたことだけ】を書く。推測・深読み・キャラの発言の作り話はしない。',
    '- 同じ内容は1つに統合。矛盾（例: 呼び名や好みの変更）は新しい方を採用して上書き。',
    '- 事実が増えすぎたら重要な（繰り返し出る・本人が大事にしている）ものを優先し、最大12件に収める。',
    '- 【機微・特定情報は書かない】: 健康/病歴・正確な住所や位置・電話/メール等の連絡先・パスワードや認証情報・その他センシティブな個人情報。',
    '- 覚えるべきことが無ければ空のリストを返す。',
    '- 必ず指定の JSON スキーマだけで答える（前置き・コードブロックなし）。',
  ].join('\n')
}

/**
 * 風景コメント（STEP7）用の system prompt。
 * ユーザーがカメラで見せた「今いる場所・景色」に、相棒として短くひとこと反応する。
 * 会話より一段短い1文のつぶやきにする（その場の演出。図鑑には残さない）。
 */
export function buildSceneSystemPrompt(personaText: string): string {
  return [
    'あなたは以下のペルソナを持つ妖精キャラクターです。',
    'ユーザーがカメラで見せた「いまいる場所・景色」に対して、隣にいる相棒として短くひとことコメントします。',
    '次のルールを必ず守ってください。',
    '- ペルソナの口調・性格・一人称/二人称を厳密に守る。',
    '- コメントは1文の短いつぶやき（おおむね30文字以内）。',
    '- 写っているものを断定しすぎず、見えたものに素直に反応する。',
    '- 絵文字・Markdownは使わない。キャラクターを崩さない（AIやシステムに言及しない）。',
    '',
    '# ペルソナ定義',
    personaText.trim(),
  ].join('\n')
}
