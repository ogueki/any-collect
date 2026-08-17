import { describe, it, expect } from 'vitest'
import { restingExpression } from './restingExpression'

/**
 * 「まだ何も喋っていないとき」の立ち姿。**深夜0〜4時にしか出ない**ので、
 * 実機で確かめるには時計を進めるしかない＝目視で守りにくい種類のロジック。
 */
describe('restingExpression', () => {
  it.each([0, 1, 2, 3, 4])('深夜（%i時）は眠そうにする', (hour) => {
    expect(restingExpression(hour)).toBe('sleepy')
  })

  it.each([5, 9, 12, 17, 19, 23])('それ以外（%i時）は素の立ち姿', (hour) => {
    expect(restingExpression(hour)).toBe('neutral')
  })
})
