import { describe, it, expect } from 'vitest'
import {
  CATEGORY_CODE,
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  toCategory,
} from './category'

/**
 * カテゴリは「保存は安定キー・表示はカタカナ」に分けてある（ラベルを変えてもデータ移行が要らない）。
 * AI が enum を外した値を返すこともあるので、正規化が最後の砦になる。
 */

describe('toCategory', () => {
  it.each(CATEGORY_ORDER)('既知のキーはそのまま: %s', (key) => {
    expect(toCategory(key)).toBe(key)
  })

  it('未知の文字列は other に倒す（旧データの自由文字列の救済）', () => {
    expect(toCategory('たべもの')).toBe('other')
    expect(toCategory('Food')).toBe('other') // 大文字小文字は区別する（保存値は小文字で固定）
    expect(toCategory('__proto__')).toBe('other')
  })

  it('空・null・undefined も other', () => {
    expect(toCategory('')).toBe('other')
    expect(toCategory(null)).toBe('other')
    expect(toCategory(undefined)).toBe('other')
  })
})

describe('カテゴリの定義', () => {
  it('すべてのキーにラベル・標本記号・絵文字がある', () => {
    for (const key of CATEGORY_ORDER) {
      expect(CATEGORY_LABEL[key]).toBeTruthy()
      expect(CATEGORY_CODE[key]).toBeTruthy()
      expect(CATEGORY_EMOJI[key]).toBeTruthy()
    }
  })

  it('標本記号は1文字で重複しない（図鑑の番号 F-001 等が衝突しない）', () => {
    const codes = CATEGORY_ORDER.map((k) => CATEGORY_CODE[k])
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of codes) expect(c).toHaveLength(1)
  })

  it('other は並びの最後', () => {
    expect(CATEGORY_ORDER[CATEGORY_ORDER.length - 1]).toBe('other')
  })
})
