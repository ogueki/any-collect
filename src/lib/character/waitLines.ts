/**
 * 「待ち時間」に見せるテキスト（演出用・AI生成ではない）。
 *
 * ⚠️ tips の口調の基準は各キャラの `src/characters/<id>/persona.md`。
 *   非コーダーでも編集しやすいよう素のテキストで置くが、追記時は persona の口調
 *   （タメ口・語尾「〜だね/〜だよ」・絵文字なし）に揃える。
 *
 * コンテキストは `summoning`（召喚＝図鑑エントリ1つ→透過アイテムの待ち）と
 * `synthesizing`（窯＝2アイテム合成の待ち）。どちらも GeneratingOverlay で使う。
 * ⚠️ 1つを呼び出す召喚と、2つを混ぜる窯では言うことが違う。コピーを共用しない。
 */

export type WaitContext = 'summoning' | 'synthesizing'

/** 進捗に連動して切り替わる「状況ステータス」（短い状況説明・前半→中盤→終盤）。 */
const STATUS_STAGES: Record<WaitContext, string[]> = {
  summoning: ['呼びかけているよ…', 'こっちの世界に来るよ…', 'もうすぐ出てくるよ…'],
  synthesizing: ['窯に火を入れてるよ…', 'ふたつを混ぜ合わせてるよ…', 'もうすぐできあがり…'],
}

/** 待ち時間にローテーション表示するコレットの豆知識／ひとこと（遊び方＋世界観の混在）。 */
const TIPS: Record<WaitContext, Record<string, string[]>> = {
  summoning: {
    default: [
      'ずかんのモノに、いま呼びかけてるところ',
      'うまくいくと、たからばこに増えるんだよ',
      'おなじものを呼んでも、毎回ちがう姿で来るんだよね',
      'まほうパワーは、写真を撮ったりおしゃべりすると貯まるよ',
      'どんな姿で来てくれるかな',
      'ふむふむ…うまく呼べるといいな',
    ],
  },
  synthesizing: {
    default: [
      'ふたつのアイテムが出会うと、なにが生まれるかな',
      '窯の温度がだいじなんだよ…って、わたしが調節してるの',
      'おなじ組み合わせでも、毎回ちがうものができるかも',
      'レアなアイテム同士だと、すごいのができやすいんだって',
      'どきどき…うまく混ざるといいね',
      'むかしの妖精は、窯でお星さまも作れたんだって',
    ],
  },
}

/** 指定コンテキストの状況ステータス配列を返す。 */
export function getStatusStages(context: WaitContext = 'summoning'): string[] {
  return STATUS_STAGES[context]
}

/** 指定キャラ・コンテキストの tips 配列を返す（未定義キャラは default にフォールバック）。 */
export function getTips(characterId: string, context: WaitContext = 'summoning'): string[] {
  const byCharacter = TIPS[context]
  return byCharacter[characterId] ?? byCharacter.default
}
