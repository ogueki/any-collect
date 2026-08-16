import type { FairyExpression } from './CharacterRenderer'
import { timeOfDayLabel } from '../../store/chatStore'

/**
 * 会話が始まる前の「常態」の表情を時間帯だけから決める純関数。
 *
 * ⚠️ **眠さは反応ではなく常態**。他の感情は*ユーザーの発言への反応*として AI が選ぶが、
 * 眠さは時間帯だけで決まる。反応の側（`CHAT_EMOTIONS`）にも `sleepy` は入っているが、
 * あちらは「深夜だと知ったうえで返事に添える」経路で、こちらは**まだ何も喋っていないとき**の
 * 立ち姿。2経路の役割分担は `CharacterRenderer.ts` の `sleepy` のコメント参照。
 *
 * 区分は会話の接地・ホーム背景と同じ `timeOfDayLabel` に乗せる（時間の切り方を1か所に保つ）。
 */
export function restingExpression(hour: number): FairyExpression {
  return timeOfDayLabel(hour) === '深夜' ? 'sleepy' : 'neutral'
}
