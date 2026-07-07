import type { CollectionEntry, ItemCategory, Photo } from '../types'
import { CATEGORY_LABEL } from './category'

/**
 * 会話の「接地（grounding）」ノートを、図鑑（CollectionEntry）とアルバム（Photo）から
 * 決定的に集計する純関数（副作用なし・DB/API 呼び出しなし・v2 STEP2c）。
 *
 * 生成物は chatStore.send が集めて `ChatContext.groundingNotes` に載せ、
 * `buildSystemPrompt`（api/_lib/persona.ts）が system prompt に注入する。これにより
 * コレットが「きみが最近なにを集めている/撮っているか」に会話で自然に触れられる。
 * 空なら [] を返す（呼び出し側は注入をスキップして素の会話に落ちる）。
 */

export interface GroundingInput {
  entries: CollectionEntry[]
  photos: Photo[]
}

const MAX_NOTES = 3
/** 1ノートの最大文字数（system prompt 肥大＝コスト/レイテンシを抑える安全弁）。 */
const MAX_NOTE_LEN = 200
/** アルバム被写体ラベルの最大文字数（caption が長文でも一覧を短く保つ）。 */
const MAX_LABEL_LEN = 24

export function buildGroundingNotes({ entries, photos }: GroundingInput): string[] {
  const notes: string[] = []
  // 既に触れた名前。図鑑→アルバムで同じものを二度言わないための蓄積。
  const mentioned = new Set<string>()

  if (entries.length > 0) {
    // 1. カテゴリ傾向：種類数が最多のカテゴリ（2種以上のときだけ言う）。
    const byCat = new Map<ItemCategory, CollectionEntry[]>()
    for (const e of entries) {
      const arr = byCat.get(e.category)
      if (arr) arr.push(e)
      else byCat.set(e.category, [e])
    }
    const top = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)[0]
    if (top && top[1].length >= 2) {
      const examples = [...top[1]]
        .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
        .slice(0, 3)
        .map((e) => e.name)
      examples.forEach((n) => mentioned.add(n))
      notes.push(
        `最近よく集めているのは ${CATEGORY_LABEL[top[0]]} 系（${examples.join('・')} など）。図鑑は全 ${entries.length} 種。`,
      )
    }

    // 2. 直近に集めた種（lastSeenAt 降順）。1で挙げた例は除いて重複を避ける。
    const recent = [...entries]
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .map((e) => e.name)
      .filter((n) => !mentioned.has(n))
      .slice(0, 3)
    if (recent.length > 0) {
      recent.forEach((n) => mentioned.add(n))
      notes.push(`最近見つけたもの: ${recent.join('・')}。`)
    }
  }

  // 3. 直近に撮った一枚（アルバムは新しい順保持）。図鑑で触れた名前は除く＝
  //    種にならなかった風景写真など、図鑑からは出ない「撮った瞬間」を拾う。
  const recentShots: string[] = []
  for (const p of photos) {
    const raw = p.subjectName?.trim() || p.caption?.trim()
    if (!raw) continue
    const label = raw.length > MAX_LABEL_LEN ? raw.slice(0, MAX_LABEL_LEN) : raw
    if (mentioned.has(label)) continue
    mentioned.add(label)
    recentShots.push(label)
    if (recentShots.length >= 2) break
  }
  if (recentShots.length > 0) {
    notes.push(`アルバムに残した直近の一枚: ${recentShots.join('・')}。`)
  }

  return notes
    .map((n) => (n.length > MAX_NOTE_LEN ? n.slice(0, MAX_NOTE_LEN) : n))
    .slice(0, MAX_NOTES)
}
