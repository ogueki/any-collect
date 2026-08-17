import { describe, it, expect } from 'vitest'
import { buildGroundingNotes } from './grounding'
import type { CollectionEntry, ItemCategory, Photo } from '../types'

/**
 * 会話の接地ノート。**毎回のリクエストに載る**ので、ここが壊れると
 * コレットが毎回同じものを蒸し返したり、無いものを言ったりする（体験に直結するのに、
 * 画面には出ないのでバグに気づけない）。
 */

const blob = new Blob([])

function entry(name: string, category: ItemCategory, lastSeenAt: string): CollectionEntry {
  return {
    id: name,
    speciesKey: name,
    name,
    description: '',
    category,
    blob,
    count: 1,
    firstSeenAt: lastSeenAt,
    lastSeenAt,
  }
}

function photo(subjectName?: string, caption?: string): Photo {
  return { id: subjectName ?? caption ?? 'p', blob, subjectName, caption, createdAt: '2026-08-18' }
}

describe('buildGroundingNotes', () => {
  it('何も無ければ空（呼び出し側は注入をスキップして素の会話に落ちる）', () => {
    expect(buildGroundingNotes({ entries: [], photos: [] })).toEqual([])
  })

  it('最多カテゴリの傾向を言う（2種以上のときだけ）', () => {
    const notes = buildGroundingNotes({
      entries: [
        entry('ねこ', 'creature', '2026-08-01'),
        entry('いぬ', 'creature', '2026-08-02'),
        entry('ねじ', 'gear', '2026-08-03'),
      ],
      photos: [],
    })
    expect(notes[0]).toContain('クリーチャー')
    expect(notes[0]).toContain('図鑑は全 3 種')
  })

  it('1種しか無いカテゴリを「よく集めている」とは言わない', () => {
    const notes = buildGroundingNotes({
      entries: [entry('ねこ', 'creature', '2026-08-01')],
      photos: [],
    })
    expect(notes.join('')).not.toContain('よく集めている')
    expect(notes[0]).toContain('最近見つけたもの')
  })

  it('同じ名前を2つのノートで繰り返さない', () => {
    // 傾向で挙げた例を「最近見つけたもの」でもう一度言うと、いかにも機械的になる。
    const notes = buildGroundingNotes({
      entries: [
        entry('ねこ', 'creature', '2026-08-03'),
        entry('いぬ', 'creature', '2026-08-02'),
      ],
      photos: [],
    })
    const joined = notes.join('\n')
    expect(joined.match(/ねこ/g)).toHaveLength(1)
  })

  it('図鑑で触れたものはアルバム側では繰り返さない', () => {
    const notes = buildGroundingNotes({
      entries: [
        entry('ねこ', 'creature', '2026-08-03'),
        entry('いぬ', 'creature', '2026-08-02'),
      ],
      photos: [photo('ねこ'), photo('ゆうやけ')],
    })
    const album = notes.find((n) => n.startsWith('アルバム'))
    expect(album).toContain('ゆうやけ')
    expect(album).not.toContain('ねこ')
  })

  it('被写体名が無ければ caption を使い、どちらも無い写真は飛ばす', () => {
    const notes = buildGroundingNotes({
      entries: [],
      photos: [photo(undefined, undefined), photo(undefined, '青い花')],
    })
    expect(notes[0]).toContain('青い花')
  })

  it('長すぎるラベルは切り詰める（system prompt を膨らませない）', () => {
    const long = 'あ'.repeat(80)
    const notes = buildGroundingNotes({ entries: [], photos: [photo(long)] })
    expect(notes[0].length).toBeLessThan(60)
  })

  it('ノートは最大3件', () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      entry(`もの${i}`, 'nature', `2026-08-${String(i + 1).padStart(2, '0')}`),
    )
    const photos = Array.from({ length: 10 }, (_, i) => photo(`しゃしん${i}`))
    expect(buildGroundingNotes({ entries, photos }).length).toBeLessThanOrEqual(3)
  })
})
