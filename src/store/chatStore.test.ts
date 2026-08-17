import { describe, it, expect } from 'vitest'
import { reunionBucket, timeOfDayLabel, trimMessages } from './chatStore'
import type { ChatMessage } from '../types'

/**
 * 会話まわりの純関数。**どれも「間違っていても画面を見ただけでは気づけない」**種類の処理：
 * 履歴の切り詰めは記憶の取りこぼしとして、再会の判定は数十分後に開かないと再現しない形で出る。
 */

function msg(i: number, role: ChatMessage['role'] = 'user'): ChatMessage {
  return { id: `m${i}`, role, content: `#${i}`, createdAt: '2026-08-18T00:00:00.000Z' }
}

function messages(n: number): ChatMessage[] {
  return Array.from({ length: n }, (_, i) => msg(i))
}

describe('trimMessages', () => {
  it('上限（60件）以下なら何もしない', () => {
    const list = messages(60)
    const out = trimMessages(list, 0)
    expect(out.messages).toHaveLength(60)
    expect(out.consolidatedCount).toBe(0)
  })

  it('捨てるのは要約済みの分だけ', () => {
    // ⚠️ ここが要。未要約の会話を消すと、その内容は**二度と記憶に入らない**
    //（永続化しているので取り返しがつかない）。
    const out = trimMessages(messages(70), 4)
    expect(out.messages).toHaveLength(66) // 10件超過だが要約済み4件しか捨てない
    expect(out.messages[0].id).toBe('m4')
    expect(out.consolidatedCount).toBe(0)
  })

  it('要約が1件も進んでいなければ、上限を超えていても捨てない', () => {
    const out = trimMessages(messages(70), 0)
    expect(out.messages).toHaveLength(70)
    expect(out.consolidatedCount).toBe(0)
  })

  it('要約済みが多くても、上限までしか捨てない', () => {
    const out = trimMessages(messages(70), 65)
    expect(out.messages).toHaveLength(60)
    expect(out.consolidatedCount).toBe(55) // 捨てた10件ぶんカウンタもずらす
  })

  it('絶対上限（200件）を超えたら、未要約でも強制的に捨てる', () => {
    // 要約がずっと失敗し続けても履歴を無限には伸ばさない安全弁。
    const out = trimMessages(messages(210), 0)
    expect(out.messages).toHaveLength(200)
    expect(out.messages[0].id).toBe('m10')
    expect(out.consolidatedCount).toBe(0)
  })
})

describe('reunionBucket', () => {
  const now = new Date('2026-08-18T12:00:00+09:00')
  const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString()

  it('履歴が無ければ first（はじめまして）', () => {
    expect(reunionBucket(null, now)).toBe('first')
  })

  it('壊れた日付も first として扱う（落とさない）', () => {
    expect(reunionBucket('not a date', now)).toBe('first')
  })

  it('30分以内は第一声を出さない（リロードは静かに続きから）', () => {
    expect(reunionBucket(ago(0), now)).toBeNull()
    expect(reunionBucket(ago(29), now)).toBeNull()
  })

  it('30分を過ぎたら back（また来たね）', () => {
    expect(reunionBucket(ago(31), now)).toBe('back')
    expect(reunionBucket(ago(60 * 5), now)).toBe('back')
  })

  it('日付が変わっても3時間未満なら days と名乗らない', () => {
    // 23時→翌1時は感覚として「さっきの続き」。日跨ぎだけで「久しぶり」にしない。
    const lateNight = new Date('2026-08-18T01:00:00+09:00')
    const twoHoursAgo = new Date('2026-08-17T23:00:00+09:00').toISOString()
    expect(reunionBucket(twoHoursAgo, lateNight)).toBe('back')
  })

  it('日跨ぎ＋3時間以上で days（久しぶり）', () => {
    const yesterday = new Date('2026-08-17T12:00:00+09:00').toISOString()
    expect(reunionBucket(yesterday, now)).toBe('days')
  })

  it('同じ日なら何時間空いても days にならない', () => {
    expect(reunionBucket(ago(60 * 8), now)).toBe('back')
  })
})

describe('timeOfDayLabel', () => {
  // 会話の接地・部屋の背景・常態の表情がすべてこの1か所の区分に乗る。
  it.each([
    [0, '深夜'],
    [4, '深夜'],
    [5, '朝'],
    [10, '朝'],
    [11, '昼'],
    [15, '昼'],
    [16, '夕方'],
    [18, '夕方'],
    [19, '夜'],
    [23, '夜'],
  ])('%i時 → %s', (hour, expected) => {
    expect(timeOfDayLabel(hour)).toBe(expected)
  })
})
