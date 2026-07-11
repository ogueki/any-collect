import { create } from 'zustand'

/**
 * コレットの「まほうパワー」ゲージ（v2・STEP1e／レイアウト再構成で「元気」から改称）。
 * 安い日常行動（会話・撮影）で少しずつ貯まり、満タンで図鑑からの召喚魔法（アイテム化）を
 * 1回解禁する（生成成功でリセット）＝高価なアイテム化の配給。
 * フレーミングは通貨ではなく「コレットに宿るまほうの力」（spec §4.3）。
 *
 * 永続はローカルの軽量値なので localStorage を手書き（他ストアは IndexedDB だが、
 * ここは単一の数値なので過剰にせず localStorage で足りる）。STEP6 で必要ならクラウド化。
 *
 * 「1日1個」の厳密な日次クロックは STEP1 では入れない（ソフトペーシング／tuning 送り）。
 */

/** 満タン値（内部）。表示はフィル率で出す（数値は見せない）。 */
export const GAUGE_MAX = 100
/** 会話の返事1回で貯まる量（≈5返信で満タン・チューニング可）。 */
export const GAUGE_PER_CHAT = 20
/** 撮影してアルバム保存1回で貯まる量（≈3撮影で満タン・チューニング可）。 */
export const GAUGE_PER_CAPTURE = 34

const STORAGE_KEY = 'anycollect.gauge.v1'

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** localStorage から現在値を復元（無効値は 0）。SSR/非対応環境でも壊れないようガード。 */
function readInitial(): number {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    const n = raw != null ? Number(raw) : 0
    return Number.isFinite(n) ? clamp(n, 0, GAUGE_MAX) : 0
  } catch {
    return 0
  }
}

function persist(value: number): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // 保存に失敗してもゲージ自体は動く（永続だけ諦める）。
  }
}

interface GaugeState {
  /** 現在値 0..GAUGE_MAX */
  value: number
  /** 満タンか（窯のアイテム化を解禁できる） */
  isFull: () => boolean
  /** まほうパワーを足す（クランプ＋永続）。安い行動から呼ぶ */
  add: (amount: number) => void
  /** 使い切る（召喚で生成成功したときにリセット） */
  spend: () => void
}

export const useGaugeStore = create<GaugeState>((set, get) => ({
  value: readInitial(),

  isFull: () => get().value >= GAUGE_MAX,

  add: (amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return
    const next = clamp(get().value + amount, 0, GAUGE_MAX)
    if (next === get().value) return
    persist(next)
    set({ value: next })
  },

  spend: () => {
    persist(0)
    set({ value: 0 })
  },
}))
