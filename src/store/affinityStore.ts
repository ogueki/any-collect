import { create } from 'zustand'

/**
 * コレットとの「なつき度」＝好感度の状態（v2・STEP2a → 2026-07-22 に上限を撤廃）。
 * 会話・撮影・召喚など「一緒に過ごす行動」で少しずつ貯まる。
 *
 * **スコアもレベルも上限なし**＝節目（レベルアップ演出）がずっと訪れ続ける。
 * レベルに「何が解禁されるか」の意味づけは後から足す前提で、いまは**素材の記録**だけ先に始める：
 * 通った日数・始めた日・何で貯めたかの内訳は、**後から絶対に復元できない**ので今から数える
 * （spec §4.4 の多軸化＝信頼＝毎日いる／冒険心＝外で撮る／趣味＝集める、の材料になる）。
 *
 * 永続は gauge/memory と同じ localStorage（関係データなので本来はクラウド寄りだが、
 * STEP6 で Supabase へ移すまではローカル）。
 */

/** 早期のレベル境界（Lv2・Lv3 の入口）。最初の2段だけ速くして「変わった」を早く見せる。 */
export const EARLY_THRESHOLDS = [30, 100] as const
/** Lv4 以降の1レベルあたりのスコア（一定間隔＝節目が永続する。会話+6 なら約25回で1段）。 */
export const POINTS_PER_LEVEL = 150
/** 口調・立ち絵の tier は persona.md / スプライトの都合で3段まで（レベルは無限でも tier は頭打ち）。 */
export const MAX_TONE_TIER = 3

/** 行動ごとの加算量（tuning 可）。gauge と同じ行動で両方増える（gauge=消費・なつき=永続で別物）。 */
export const AFFINITY_PER_CHAT = 6
export const AFFINITY_PER_CAPTURE = 4
export const AFFINITY_PER_ITEM = 12

/** なつきが増えた理由。内訳を残しておくと、後から「冒険心/趣味」等の軸を作れる。 */
export type AffinitySource = 'chat' | 'capture' | 'item'

const STORAGE_KEY = 'anycollect.affinity.v2'
/** v1＝スコアだけの素の数値（移行のために読むだけ）。 */
const LEGACY_KEY = 'anycollect.affinity.v1'

/** score から現在のレベル（1..∞）を求める。早期は速め、その後は一定間隔。 */
export function levelForScore(score: number): number {
  let level = 1
  for (const t of EARLY_THRESHOLDS) if (score >= t) level++
  const last = EARLY_THRESHOLDS[EARLY_THRESHOLDS.length - 1]
  if (score >= last) level += Math.floor((score - last) / POINTS_PER_LEVEL)
  return level
}

/** そのレベルが始まるスコア（進捗バーの基準）。 */
export function scoreForLevel(level: number): number {
  if (level <= 1) return 0
  if (level <= EARLY_THRESHOLDS.length + 1) return EARLY_THRESHOLDS[level - 2]
  const last = EARLY_THRESHOLDS[EARLY_THRESHOLDS.length - 1]
  return last + (level - (EARLY_THRESHOLDS.length + 1)) * POINTS_PER_LEVEL
}

/** 次のレベルまでの進捗（0..1）。レベルに上限が無いので「あと何%」は常に出せる。 */
export function levelProgress(score: number): number {
  const level = levelForScore(score)
  const start = scoreForLevel(level)
  const next = scoreForLevel(level + 1)
  if (next <= start) return 0
  return Math.min(1, Math.max(0, (score - start) / (next - start)))
}

/**
 * persona.md「好感度別の口調」と level-aware スプライトに渡す tier（1..3）。
 * レベルは無限に伸びるが、tier は用意された段数で頭打ちにする（Lv.7 に対応する tier は無いため）。
 */
export function toneTierForLevel(level: number): number {
  return Math.min(Math.max(1, level), MAX_TONE_TIER)
}

/** ローカル日付のキー（YYYY-MM-DD）。「通った日数」の判定に使う。 */
function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

interface AffinityRecord {
  v: 2
  score: number
  /** はじめて一緒に過ごした日（ISO）。「一緒にいて◯日目」に使える */
  firstAt: string | null
  /** 通算で何日来たか（連続でなく通算＝休んでも減らない） */
  dayCount: number
  /** 最後に加算した日のキー（dayCount の重複加算を防ぐ） */
  lastDayKey: string | null
  /** 何で貯めたかの内訳（後から軸を作るための素材） */
  bySource: Record<AffinitySource, number>
}

const EMPTY: AffinityRecord = {
  v: 2,
  score: 0,
  firstAt: null,
  dayCount: 0,
  lastDayKey: null,
  bySource: { chat: 0, capture: 0, item: 0 },
}

function readInitial(): AffinityRecord {
  try {
    if (typeof localStorage === 'undefined') return EMPTY
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return EMPTY
      const r = parsed as Record<string, unknown>
      const num = (v: unknown): number =>
        typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0
      const src = (r.bySource ?? {}) as Record<string, unknown>
      return {
        v: 2,
        score: num(r.score),
        firstAt: typeof r.firstAt === 'string' ? r.firstAt : null,
        dayCount: num(r.dayCount),
        lastDayKey: typeof r.lastDayKey === 'string' ? r.lastDayKey : null,
        bySource: {
          chat: num(src.chat),
          capture: num(src.capture),
          item: num(src.item),
        },
      }
    }
    // v1（素のスコアだけ）からの移行＝これまで貯めたなつきは引き継ぐ。
    // 日数・内訳は当時記録していないので 0 から数え始める（復元はできない）。
    const legacy = localStorage.getItem(LEGACY_KEY)
    const n = legacy != null ? Number(legacy) : 0
    return Number.isFinite(n) && n > 0 ? { ...EMPTY, score: n } : EMPTY
  } catch {
    return EMPTY
  }
}

function persist(rec: AffinityRecord): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(rec))
  } catch {
    // 保存に失敗してもなつき自体は動く（永続だけ諦める）。
  }
}

interface AffinityState extends AffinityRecord {
  /** レベルが上がった瞬間に新レベルが入る（演出用・表示側が消す）。未発生は null */
  pendingLevelUp: number | null
  /** 現在のレベル（1..∞） */
  level: () => number
  /** persona/スプライトに渡す tier（1..3・レベルの頭打ち版） */
  toneTier: () => number
  /** なつきを足す（レベルが上がったら pendingLevelUp を立てる）。source は内訳の記録用 */
  add: (amount: number, source: AffinitySource) => void
  /** レベルアップ演出を消化済みにする */
  clearLevelUp: () => void
  /** 検証用：次のレベルまで一気に上げる（呼び出しは `?debug=1` のときだけ＝`lib/debug.ts`） */
  bumpLevel: () => void
  /** 検証用：なつきを 0（Lv.1）に戻す（呼び出しは `?debug=1` のときだけ） */
  reset: () => void
}

export const useAffinityStore = create<AffinityState>((set, get) => {
  const snapshot = (): AffinityRecord => {
    const s = get()
    return {
      v: 2,
      score: s.score,
      firstAt: s.firstAt,
      dayCount: s.dayCount,
      lastDayKey: s.lastDayKey,
      bySource: s.bySource,
    }
  }

  /** スコアを差し替えつつ永続する（レベルアップ判定込み）。検証用の近道からも通す。 */
  const setScore = (next: number, extra?: Partial<AffinityRecord>): void => {
    const prevLevel = levelForScore(get().score)
    const nextLevel = levelForScore(next)
    const rec: AffinityRecord = { ...snapshot(), ...extra, score: next }
    persist(rec)
    set({
      ...rec,
      pendingLevelUp: nextLevel > prevLevel ? nextLevel : get().pendingLevelUp,
    })
  }

  return {
    ...readInitial(),
    pendingLevelUp: null,

    level: () => levelForScore(get().score),
    toneTier: () => toneTierForLevel(levelForScore(get().score)),

    add: (amount, source) => {
      if (!Number.isFinite(amount) || amount <= 0) return
      const now = new Date()
      const today = dayKey(now)
      const s = get()
      // 「通った日数」は日付が変わるたびに1回だけ増える（連続でなく通算＝休んでも減らない）。
      const isNewDay = s.lastDayKey !== today
      setScore(s.score + amount, {
        firstAt: s.firstAt ?? now.toISOString(),
        dayCount: isNewDay ? s.dayCount + 1 : s.dayCount,
        lastDayKey: today,
        bySource: { ...s.bySource, [source]: s.bySource[source] + amount },
      })
    },

    clearLevelUp: () => set({ pendingLevelUp: null }),

    bumpLevel: () => {
      const cur = levelForScore(get().score)
      setScore(scoreForLevel(cur + 1))
    },

    reset: () => {
      persist({ ...EMPTY })
      set({ ...EMPTY, pendingLevelUp: null })
    },
  }
})
