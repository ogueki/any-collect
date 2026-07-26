import { create } from 'zustand'

/**
 * 初回オンボーディングの進行状態（STEP4）。
 * 「見たかどうか」は端末に一度きり永続すればよい軽量値なので、他の軽量ストア（gauge/affinity）
 * と同様に localStorage 直（Repository は使わない）。step/phase の細部は再訪で復元不要＝メモリのみ。
 *
 * フェーズ：
 * - `intro`  … コレット主導の導入オーバーレイ（自己紹介→「見せて」）。
 * - `shoot`  … カメラを開いた先の「撮ってみて」ガイド（初回の一枚を後押し）。
 * - `reveal` … 初スキャン後の「図鑑へ橋渡し」＝カメラの手渡しカード＋図鑑を初めて開いた時の
 *              ヒーローリビール（＝メインコンテンツ「図鑑をつくる」を体で分からせる）。
 * - `done`   … 完了（以後は何も出さない）。
 *
 * 導入を最後まで見て「カメラをひらく」に達したら（beginShoot）その時点で永続完了扱いにする
 * ＝導入は二度と繰り返さない。撮影ガイド〜リビールは"同じセッション内"の演出で、再起動後は出さない割り切り。
 */

const STORAGE_KEY = 'anycollect.onboarding.v1'
/**
 * 初期シード（＝「はじめての召喚」に届く後押し）を配ったか。オンボの done とは別キーにして、
 * 導入をスキップ／中断した新規ユーザーでも「最初の一枚」で必ず一度だけ効くようにする
 * （＝空のたからばこで放り出さない、を phase に依存させない）。
 */
const SEED_KEY = 'anycollect.onboarding.seed.v1'

export type OnboardingPhase = 'intro' | 'shoot' | 'reveal' | 'done'

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
function readSeedGranted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SEED_KEY) === 'done'
  } catch {
    return false // 読めなければ「未配布」扱い＝最悪もう一度後押しするだけ（無害）。
  }
}
function persistSeedGranted(): void {
  try {
    localStorage.setItem(SEED_KEY, 'done')
  } catch {
    // 保存できなくてもゲージ自体は動く（次回また後押しされるだけ）。
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
  /** 初スキャン成功→図鑑リビールへ（カメラの手渡し＋図鑑のヒーロー表示）。まだ finish しない。 */
  beginReveal: () => void
  /** 完全終了（導入スキップ／図鑑リビールを閉じる／ガイドを閉じる）。 */
  finish: () => void
  /**
   * 初期シードの後押しを「まだ配っていなければ配る」＝以後 false（端末に一度きり・永続）。
   * 呼び出し側（初回撮影）は true が返ったときだけ、まほうパワーを満タンにして
   * 「はじめての召喚」に届かせる。二度目以降は本来の配給ペースに戻す。
   */
  claimSeed: () => boolean
  /** 検証用：オンボをもう一度見る（`?debug=1` のメニューから）。初期シードの後押しも再武装する。 */
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
  beginReveal: () => set({ phase: 'reveal' }),
  finish: () => {
    persistDone()
    set({ phase: 'done' })
  },
  claimSeed: () => {
    if (readSeedGranted()) return false // すでに配布済み＝以後は本来の配給ペース。
    persistSeedGranted() // 返す前に永続＝再入や二度押しでも一度きりを担保。
    return true
  },
  resetOnboarding: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(SEED_KEY) // 後押しも再武装＝debug でシードから通しで検証できる。
    } catch {
      // noop
    }
    set({ phase: 'intro', step: 0 })
  },
}))
