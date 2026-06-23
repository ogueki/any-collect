/**
 * 「待ち時間」に見せるテキスト（演出用・AI生成ではない）。
 *
 * ⚠️ tips の口調の基準は各キャラの `src/characters/<id>/persona.md`。
 *   非コーダーでも編集しやすいよう素のテキストで置くが、追記時は persona の口調
 *   （タメ口・語尾「〜だね/〜だよ」・絵文字なし）に揃える。
 *
 * いまは鑑定中（カメラのアイテム化待ち）だけ。STEP8 の合成（妖精の窯）でも
 * `synthesizing` を足せば同じ仕組み（GeneratingOverlay）で使い回せる。
 */

export type WaitContext = 'searching'

/** 進捗に連動して切り替わる「状況ステータス」（短い状況説明・前半→中盤→終盤）。 */
const STATUS_STAGES: Record<WaitContext, string[]> = {
  searching: ['鑑定中…', 'アイテムにしているよ…', 'もうすぐできるよ…'],
}

/** 待ち時間にローテーション表示するコレットの豆知識／ひとこと（遊び方＋世界観の混在）。 */
const TIPS: Record<WaitContext, Record<string, string[]>> = {
  searching: {
    default: [
      'はじめての種類を見つけると、わたしすっごくうれしくなっちゃう',
      'レアなものは、キラッと光って出てくるんだよ',
      'いろんな場所のモノを集めると、図鑑がにぎやかになるね',
      '気に入らなかったら「描き直す」でもう一回つくれるよ',
      'おなじモノでも、撮るたびにちがう仕上がりになるの、おもしろいね',
      'ふむふむ…どんなアイテムになるか、たのしみだね',
    ],
  },
}

/** 指定コンテキストの状況ステータス配列を返す。 */
export function getStatusStages(context: WaitContext = 'searching'): string[] {
  return STATUS_STAGES[context]
}

/** 指定キャラ・コンテキストの tips 配列を返す（未定義キャラは default にフォールバック）。 */
export function getTips(characterId: string, context: WaitContext = 'searching'): string[] {
  const byCharacter = TIPS[context]
  return byCharacter[characterId] ?? byCharacter.default
}
