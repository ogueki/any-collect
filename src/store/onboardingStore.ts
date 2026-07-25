import { create } from 'zustand'

/**
 * 初回オンボーディングの進行状態（STEP4）。
 * 「見たかどうか」は端末に一度きり永続すればよい軽量値なので、他の軽量ストア（gauge/affinity）
 * と同様に localStorage 直（Repository は使わない）。step/phase の細部は再訪で復元不要＝メモリのみ。
 *
 * フェーズ：
 * - `intro` … コレット主導の導入オーバーレイ（自己紹介→「見せて」）。
 * - `shoot` … カメラを開いた先の「撮ってみて」ガイド（初回の一枚を後押し）。
 * - `done`  … 完了（以後は何も出さない）。
 *
 * 導入を最後まで見て「カメラをひらく」に達したら（beginShoot）その時点で永続完了扱いにする
 * ＝導入は二度と繰り返さない。撮影ガイドは"同じセッション内"の演出で、再起動後は出さない割り切り。
 */

const STORAGE_KEY = 'anycollect.onboarding.v1'

export type OnboardingPhase = 'intro' | 'shoot' | 'done'

function readDone(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'done'
  } catch {
    return false // localStorage 不可（プライベートモード等）でも落とさない＝毎回オンボ、で妥協
  }
}
function persistDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'done')
  } catch {
    // 保存できなくても本編は動く（次回また出るだけ）。
  }
}

interface OnboardingState {
  /** 現在のフェーズ。`intro` のときだけオーバーレイ、`shoot` のときだけ撮影ガイドを出す。 */
  phase: OnboardingPhase
  /** 導入台本の現在ステップ index（メモリのみ）。 */
  step: number
  /** 導入の次のステップへ。 */
  next: () => void
  /** 導入完了→撮影ガイドへ（＝「カメラをひらく」）。この時点で永続完了にし、導入は二度と出さない。 */
  beginShoot: () => void
  /** 完全終了（導入スキップ／初撮影完了／ガイドを閉じる）。 */
  finish: () => void
  /** 検証用：オンボをもう一度見る（`?debug=1` のメニューから）。 */
  resetOnboarding: () => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  phase: readDone() ? 'done' : 'intro',
  step: 0,
  next: () => set((s) => ({ step: s.step + 1 })),
  beginShoot: () => {
    persistDone()
    set({ phase: 'shoot' })
  },
  finish: () => {
    persistDone()
    set({ phase: 'done' })
  },
  resetOnboarding: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // noop
    }
    set({ phase: 'intro', step: 0 })
  },
}))
