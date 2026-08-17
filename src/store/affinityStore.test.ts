import { describe, it, expect } from 'vitest'
import {
  EARLY_THRESHOLDS,
  MAX_TONE_TIER,
  POINTS_PER_LEVEL,
  levelForScore,
  levelProgress,
  scoreForLevel,
  toneTierForLevel,
} from './affinityStore'

/**
 * なつき度のレベル曲線。**上限が無い**（節目がずっと訪れ続ける）のが設計の肝なので、
 * 「どこかで頭打ちになっていないか」「進捗バーが 0/1 を突き抜けないか」を固定する。
 */

describe('levelForScore', () => {
  it('0 から始まる（Lv.0 は存在しない）', () => {
    expect(levelForScore(0)).toBe(1)
    expect(levelForScore(29)).toBe(1)
  })

  it('早期の2段は速い（Lv2=30・Lv3=100）', () => {
    expect(levelForScore(EARLY_THRESHOLDS[0])).toBe(2)
    expect(levelForScore(EARLY_THRESHOLDS[1])).toBe(3)
    expect(levelForScore(99)).toBe(2)
  })

  it('Lv4 以降は一定間隔', () => {
    const last = EARLY_THRESHOLDS[EARLY_THRESHOLDS.length - 1]
    expect(levelForScore(last + POINTS_PER_LEVEL)).toBe(4)
    expect(levelForScore(last + POINTS_PER_LEVEL * 2)).toBe(5)
  })

  it('上限が無い（大きなスコアでも伸び続ける）', () => {
    expect(levelForScore(100_000)).toBeGreaterThan(600)
  })

  it('スコアが増えてレベルが下がることはない', () => {
    let prev = 0
    for (let s = 0; s <= 2000; s += 7) {
      const lv = levelForScore(s)
      expect(lv).toBeGreaterThanOrEqual(prev)
      prev = lv
    }
  })
})

describe('scoreForLevel', () => {
  it('levelForScore と往復して一致する', () => {
    for (let lv = 1; lv <= 20; lv++) {
      expect(levelForScore(scoreForLevel(lv))).toBe(lv)
      // 境界の1つ手前は必ず1つ下のレベル。
      if (lv > 1) expect(levelForScore(scoreForLevel(lv) - 1)).toBe(lv - 1)
    }
  })
})

describe('levelProgress', () => {
  it('レベルの入口はちょうど 0', () => {
    expect(levelProgress(0)).toBe(0)
    expect(levelProgress(EARLY_THRESHOLDS[0])).toBe(0)
  })

  it('次のレベルの直前は 1 に近づく', () => {
    const nearNext = EARLY_THRESHOLDS[1] - 1
    expect(levelProgress(nearNext)).toBeGreaterThan(0.9)
  })

  it('常に 0..1 に収まる', () => {
    for (let s = 0; s <= 3000; s += 13) {
      const p = levelProgress(s)
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })
})

describe('toneTierForLevel', () => {
  // 立ち絵の lv1/lv2… は用意した枚数までしか無いので、レベルが伸びても頭打ちにする。
  it('1 未満は 1 に持ち上げる', () => {
    expect(toneTierForLevel(0)).toBe(1)
    expect(toneTierForLevel(-5)).toBe(1)
  })

  it('用意した段数までは素通し', () => {
    expect(toneTierForLevel(1)).toBe(1)
    expect(toneTierForLevel(MAX_TONE_TIER)).toBe(MAX_TONE_TIER)
  })

  it('それ以上は頭打ち', () => {
    expect(toneTierForLevel(MAX_TONE_TIER + 1)).toBe(MAX_TONE_TIER)
    expect(toneTierForLevel(999)).toBe(MAX_TONE_TIER)
  })
})
