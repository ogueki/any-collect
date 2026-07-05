import { create } from 'zustand'

/**
 * コレットとの「絆（なつき度）」＝好感度の状態（v2・STEP2a）。
 * 会話・撮影・アイテム化など「一緒に過ごす行動」で少しずつ貯まり、レベルが上がると
 * コレットの口調（persona.md の「好感度別の口調」tier）と立ち絵（level-aware スプライト）が
 * 少しずつ砕けていく＝「やりこむと反応が変わる相棒」。
 *
 * まずは 1 軸（絆）。多軸（信頼/冒険心/趣味）は後続。永続は gaugeStore と同じ localStorage
 * （関係データなので本来はクラウド寄りだが、STEP6 で Supabase へ移すまではローカル）。
 */

/** レベルのしきい値（score がこの値以上で該当レベル）。早期は速め（tuning 可）。 */
export const LEVEL_THRESHOLDS = [0, 30, 100] as const
/** 最大レベル。 */
export const MAX_LEVEL = LEVEL_THRESHOLDS.length

/** 行動ごとの加算量（tuning 可）。gauge と同じ行動で両方増える（gauge=消費・絆=永続で別物）。 */
export const AFFINITY_PER_CHAT = 6
export const AFFINITY_PER_CAPTURE = 4
export const AFFINITY_PER_ITEM = 12

const STORAGE_KEY = 'anycollect.affinity.v1'

/** score から現在のレベル（1..MAX_LEVEL）を求める。 */
export function levelForScore(score: number): number {
  let level = 1
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (score >= LEVEL_THRESHOLDS[i]) level = i + 1
  }
  return level
}

function readInitial(): number {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    const n = raw != null ? Number(raw) : 0
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function persist(value: number): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // 保存に失敗しても絆自体は動く（永続だけ諦める）。
  }
}

interface AffinityState {
  /** 累積スコア（0..∞） */
  score: number
  /** レベルが上がった瞬間に新レベルが入る（演出用・表示側が消す）。未発生は null */
  pendingLevelUp: number | null
  /** 現在のレベル（1..MAX_LEVEL） */
  level: () => number
  /** 絆を足す（レベルが上がったら pendingLevelUp を立てる） */
  add: (amount: number) => void
  /** レベルアップ演出を消化済みにする */
  clearLevelUp: () => void
  /** 検証用：次のレベルまで一気に上げる（TODO(verify) リリース前に外す） */
  bumpLevel: () => void
}

export const useAffinityStore = create<AffinityState>((set, get) => ({
  score: readInitial(),
  pendingLevelUp: null,

  level: () => levelForScore(get().score),

  add: (amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return
    const prev = get().score
    const next = prev + amount
    const prevLevel = levelForScore(prev)
    const nextLevel = levelForScore(next)
    persist(next)
    set({ score: next, pendingLevelUp: nextLevel > prevLevel ? nextLevel : get().pendingLevelUp })
  },

  clearLevelUp: () => set({ pendingLevelUp: null }),

  bumpLevel: () => {
    const cur = levelForScore(get().score)
    if (cur >= MAX_LEVEL) return
    const target = LEVEL_THRESHOLDS[cur] // 次レベルの開始しきい値
    persist(target)
    set({ score: target, pendingLevelUp: cur + 1 })
  },
}))
