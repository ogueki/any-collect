import { create } from 'zustand'

/**
 * オマケ（タワーバトル）のベストスコア。localStorage 永続（gauge/affinity ストアと同型）。
 * 関係データ（好感度・記憶）とは無関係のただのハイスコアなので、ここに独立で持つ。
 */

const STORAGE_KEY = 'anycollect.game.tower.best'

function loadBest(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const n = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

interface GameState {
  /** タワーバトルの最高積み数。 */
  towerBest: number
  /** スコアを申告し、自己ベスト更新なら true を返して永続化する。 */
  reportTowerScore: (score: number) => boolean
}

export const useGameStore = create<GameState>((set, get) => ({
  towerBest: loadBest(),
  reportTowerScore: (score) => {
    if (score <= get().towerBest) return false
    set({ towerBest: score })
    try {
      localStorage.setItem(STORAGE_KEY, String(score))
    } catch {
      // 永続に失敗しても致命ではない（今回のセッション内のベストは保持）。
    }
    return true
  },
}))
