import { create } from 'zustand'

/**
 * オマケ（タワーバトル／フラッピー）のベストスコア。localStorage 永続（gauge/affinity ストアと同型）。
 * 関係データ（好感度・記憶）とは無関係のただのハイスコアなので、ここに独立で持つ。
 */

const TOWER_KEY = 'anycollect.game.tower.best'
const FLAPPY_KEY = 'anycollect.game.flappy.best'

function loadBest(key: string): number {
  try {
    const raw = localStorage.getItem(key)
    const n = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function saveBest(key: string, score: number) {
  try {
    localStorage.setItem(key, String(score))
  } catch {
    // 永続に失敗しても致命ではない（今回のセッション内のベストは保持）。
  }
}

interface GameState {
  /** タワーバトルの最高積み数。 */
  towerBest: number
  /** スコアを申告し、自己ベスト更新なら true を返して永続化する。 */
  reportTowerScore: (score: number) => boolean
  /** フラッピーの最高くぐり数。 */
  flappyBest: number
  /** スコアを申告し、自己ベスト更新なら true を返して永続化する。 */
  reportFlappyScore: (score: number) => boolean
}

export const useGameStore = create<GameState>((set, get) => ({
  towerBest: loadBest(TOWER_KEY),
  reportTowerScore: (score) => {
    if (score <= get().towerBest) return false
    set({ towerBest: score })
    saveBest(TOWER_KEY, score)
    return true
  },
  flappyBest: loadBest(FLAPPY_KEY),
  reportFlappyScore: (score) => {
    if (score <= get().flappyBest) return false
    set({ flappyBest: score })
    saveBest(FLAPPY_KEY, score)
    return true
  },
}))
