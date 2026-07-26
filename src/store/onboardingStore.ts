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
 * コア導線の各ビートのコーチ（召喚／たからばこ／会話）を見せたか。図鑑リビールが phase で進むのに対し、
 * これらは「まほう満タン→召喚→たからばこ→ホームに戻って会話」がユーザー行動次第で phase の一本道に
 * 乗らない（長い＝途中で閉じ得る）ため、**永続の一度きりフラグ**で扱う（phase 非依存・リロードや翌日でも
 * 各画面の初回で必ず一度出る）。順番は自然な操作の流れで担保される。
 * ※まほうパワーはシードで満タンにせず撮影/会話で自然に貯める（召喚コーチは満タン到達時に出る）。
 */
const SUMMON_KEY = 'anycollect.onboarding.summon.v1'
const TREASURE_KEY = 'anycollect.onboarding.treasure.v1'
const CHAT_KEY = 'anycollect.onboarding.chat.v1'

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
// コーチ用の汎用「一度きりフラグ」。読めなければ未表示扱い（最悪もう一度出るだけ＝無害）。
function readOnceFlag(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) === 'done'
  } catch {
    return false
  }
}
function persistOnceFlag(key: string): void {
  try {
    localStorage.setItem(key, 'done')
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
  /** 初スキャン成功→図鑑リビールへ（カメラの手渡し＋図鑑のヒーロー表示）。まだ finish しない。 */
  beginReveal: () => void
  /** 完全終了（導入スキップ／図鑑リビールを閉じる／ガイドを閉じる）。 */
  finish: () => void
  /**
   * コア導線の各コーチを「もう見せたか」＝reactive な store 状態（localStorage 初期化）。
   * 表示側は **レンダー時にこの値から導出**する（effect 内で local setState しない＝図鑑リビールと同流儀）。
   * それぞれ Beat4 召喚／Beat5 たからばこ／Beat6 会話。閉じるときに mark で true＋永続。
   */
  summonCoachSeen: boolean
  treasureIntroSeen: boolean
  chatCoachSeen: boolean
  markSummonCoachSeen: () => void
  markTreasureIntroSeen: () => void
  markChatCoachSeen: () => void
  /** 検証用：オンボをもう一度見る（`?debug=1` のメニューから）。各コーチも再武装する。 */
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
  summonCoachSeen: readOnceFlag(SUMMON_KEY),
  treasureIntroSeen: readOnceFlag(TREASURE_KEY),
  chatCoachSeen: readOnceFlag(CHAT_KEY),
  markSummonCoachSeen: () => {
    persistOnceFlag(SUMMON_KEY)
    set({ summonCoachSeen: true })
  },
  markTreasureIntroSeen: () => {
    persistOnceFlag(TREASURE_KEY)
    set({ treasureIntroSeen: true })
  },
  markChatCoachSeen: () => {
    persistOnceFlag(CHAT_KEY)
    set({ chatCoachSeen: true })
  },
  resetOnboarding: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      // 各コーチも再武装＝debug で頭から通しで検証できる。
      ;[SUMMON_KEY, TREASURE_KEY, CHAT_KEY].forEach((k) => localStorage.removeItem(k))
    } catch {
      // noop
    }
    set({
      phase: 'intro',
      step: 0,
      summonCoachSeen: false,
      treasureIntroSeen: false,
      chatCoachSeen: false,
    })
  },
}))
