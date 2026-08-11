/**
 * 召喚したものを受け取ったときにコレットが言うこと（**AI が出せなかったときの受け**）。
 *
 * ⚠️ 口調の基準は各キャラの `src/characters/<id>/persona.md`。
 *   非コーダーでも編集しやすいよう素のテキストで置く（`waitLines.ts`・`failureLines.ts` と同じ流儀）。
 *
 * **ふだんのセリフは AI が作る**（`/api/generate-item` の `comment`＝そのアイテムを見て書くので
 * 固有の反応になる）。ここに置くのは、それが取れなかったときに黙らせないための保険だけ。
 *
 * **書くときのルール**：
 * - **「獲得した」ではなく「受け取った」**。召喚は、きみが見つけてきたものをコレットに渡す行為。
 *   ユーザーの戦利品ではなく、コレットへの贈りものとして喋る。
 * - システムの言葉（獲得・アイテム・追加・レアリティ）を使わない。UI の操作も指示しない。
 * - ここは**どのアイテムでも成立する言い方**にする（固有の話は AI 側の担当）。
 *   アイテム名だけは差し込めるので、`{name}` を置くとそこに入る。
 */

const FALLBACKS = [
  'わっ、「{name}」がほんとにこっちに来た…！ きみが見つけてくれたんだよね。ありがとう。',
  '見て見て、「{name}」だよ！ 目の前にあると、なんだかどきどきするね。',
  'うわぁ…「{name}」、こっちの世界だとちょっとふしぎに見える。大事にするね。',
  'ちゃんと呼べたよ、「{name}」！ きみの世界のもの、やっぱりすてきだなあ。',
] as const

/** 直前に出したものを覚えて、2回続けて同じは出さない。 */
let lastPicked = -1

/** AI のひとことが無いときに使う固定セリフを1つ返す。 */
export function summonLine(itemName: string): string {
  let i = Math.floor(Math.random() * FALLBACKS.length)
  if (i === lastPicked) i = (i + 1) % FALLBACKS.length
  lastPicked = i
  return FALLBACKS[i].replace('{name}', itemName)
}
