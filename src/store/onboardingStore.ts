import { create } from 'zustand'

/**
 * 初回オンボーディングの進行状態（STEP4）。
 * 「見たかどうか（done）」は端末に一度きり永続すればよい軽量値なので、
 * 他の軽量ストア（gauge/affinity）と同様に localStorage 直（Repository は使わない）。
 * step は再訪で復元する必要がないのでメモリのみ（毎回 0 から）。
 */

const STORAGE_KEY = 'anycollect.onboarding.v1'

function readDone(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'done'
  } catch {
    return false // localStorage 不可（プライベートモード等）でも落とさない＝毎回オンボ、で妥協
  }
}

interface OnboardingState {
  /** 初回オンボを完了/スキップ済みか（永続）。false のときだけオーバーレイを出す。 */
  done: boolean
  /** 現在のステップ index（台本 ONBOARDING_STEPS の添字・メモリのみ）。 */
  step: number
  /** 次のステップへ進む。 */
  next: () => void
  /** 完了/スキップ＝以後は出さない（永続）。 */
  finish: () => void
  /** 検証用：オンボをもう一度見る（`?debug=1` のメニューから）。 */
  resetOnboarding: () => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  done: readDone(),
  step: 0,
  next: () => set((s) => ({ step: s.step + 1 })),
  finish: () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'done')
    } catch {
      // 保存できなくても本編は動く（次回また出るだけ）。
    }
    set({ done: true })
  },
  resetOnboarding: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // noop
    }
    set({ done: false, step: 0 })
  },
}))
