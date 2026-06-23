/**
 * 「待ち時間」に妖精がつぶやく短いひとこと（演出用の固定セリフ）。
 *
 * AI 生成ではなく UI 演出なので、ここに素のテキストで置く。
 * ⚠️ 口調の基準は各キャラの `src/characters/<id>/persona.md`。非コーダーでも編集しやすいよう
 *   ここに直接書くが、追記・修正時は persona の口調（タメ口・語尾「〜だね/〜だよ」・絵文字なし）に揃える。
 *
 * いまは鑑定中（カメラのアイテム化待ち）だけ。STEP8 の合成（妖精の窯）でも
 * `synthesizing` をコンテキストに足せば同じ仕組みで使い回せる。
 */

export type WaitContext = 'searching'

const WAIT_LINES: Record<WaitContext, Record<string, string[]>> = {
  searching: {
    default: [
      'これは…なんだろう？',
      'ふむふむ、面白いものを見つけたね',
      'キラキラした力を感じるよ…！',
      'どんなアイテムになるのかな…',
      'ちょっと待ってね、よーく見てるよ',
    ],
  },
}

/** 指定キャラ・コンテキストの待ちセリフ配列を返す（未定義キャラは default にフォールバック）。 */
export function getWaitLines(characterId: string, context: WaitContext = 'searching'): string[] {
  const byCharacter = WAIT_LINES[context]
  return byCharacter[characterId] ?? byCharacter.default
}
