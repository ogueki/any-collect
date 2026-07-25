import type { FairyExpression } from '../../lib/character/CharacterRenderer'

/**
 * 初回オンボーディングでコレットが話す台本（STEP4）。
 *
 * ここが「新規で作る唯一の素材」＝**テキスト台本**。絵は既存の立ち絵/背景を流用し、
 * 声は動的TTS（`speak`）が読み上げる（固定音声＝パートボイスは後続 STEP3b）。
 *
 * - `expression` … 立ち絵の表情（`FairyExpression` の 12 種）。
 * - `direction`  … 読み方の演技指示（日本語の自由文）。感情タグと同経路で `/api/tts` に渡る。
 *   ※実証済みの肝：英語コアタグより「声優への日本語の演出メモ」が効く（`voiceDirection`）。
 *
 * チュートリアルの案内は AI に即興させず、この固定台本で決め打ちにする（進行が崩れないように）。
 * 文面はいつでもここだけで調整できる（コード無改修）。
 */
export interface OnboardingStep {
  text: string
  expression: FairyExpression
  direction: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    text: 'はじめまして！わたしはコレット。会えてうれしい〜！',
    expression: 'excited',
    direction: 'はしゃいで手を振りながら、元気いっぱいに',
  },
  {
    text: 'わたしね、きみの世界にとっても興味があるんだ！',
    expression: 'happy',
    direction: 'わくわくを抑えきれない様子で、明るくやわらかく',
  },
  {
    text: 'その「スマートフォン」で、きみが見ているものをわたしにも見せてほしいの！',
    expression: 'excited',
    direction: '好奇心いっぱいに、身を乗り出すように',
  },
  // 召喚・たからばこ・会話は初回では出さない（一点集中＝まず「撮る」へ）。
  // それらは文脈で発見させる（例：まほうパワー満タンで「召喚できる」バッジが自動で出る）。
]

/**
 * 撮影ガイド（導入の続き＝カメラを開いた先で一度だけ）。
 * 「見せて」で手渡した勢いのまま、最初の一枚を後押しする。撮ったらコレットが反応する＝体験の山。
 */
export const CAMERA_HINT: OnboardingStep = {
  text: 'さあ、下の丸いボタンを押して、見つけたものをわたしに見せて！',
  expression: 'excited',
  direction: '好奇心いっぱいに、わくわくしながら背中を押すように',
}
