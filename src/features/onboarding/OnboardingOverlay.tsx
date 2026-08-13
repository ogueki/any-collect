import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useOnboardingStore } from '../../store/onboardingStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import { homeBackgroundUrl } from '../../lib/character/homeBackground'
import { speakLine, primeAudio, stopSpeaking } from '../../lib/audio/useSpeak'
import { preloadPartVoice } from '../../lib/audio/partVoice'
import { ONBOARDING_STEPS, SPOKEN_FIXED_LINES } from './script'

/**
 * 初回オンボーディング（STEP4）＝**コレット主導の「最初の一回」**。
 * 別画面の説明会ではなく、コレット本人が喋りながら自己紹介→アプリの流れを案内し、
 * 最後に「カメラをひらく」で本編（撮る）へ手渡す。空っぽで放り出さない。
 *
 * 新規アートは無し：立ち絵・時間帯背景・声（動的TTS）はすべて既存を流用する。
 * 音声の自動再生は最初の操作（音声の「はい」）でアンロックしてから読み上げる（iOS 対策）。
 * 固定音声（パートボイス）は後続 STEP3b＝ここでは都度生成のままでよい。
 */
export default function OnboardingOverlay() {
  const characterId = useAppStore((s) => s.characterId)
  const go = useAppStore((s) => s.go)
  const setVoice = useAppStore((s) => s.setVoice)
  const step = useOnboardingStore((s) => s.step)
  const next = useOnboardingStore((s) => s.next)
  const beginShoot = useOnboardingStore((s) => s.beginShoot)
  const finish = useOnboardingStore((s) => s.finish)

  /**
   * 画面の段は2つだけ：`ask`＝音声の選択だけ（世界の説明はしない＝話者のいないナレーションを置かない）→
   * `steps`＝コレット登場。**間に前置きを挟まない**（気配のささやきを試したが、初対面が遠くなるため撤去）。
   */
  const [phase, setPhase] = useState<'ask' | 'steps'>('ask')
  const started = phase === 'steps'

  const total = ONBOARDING_STEPS.length
  const current = ONBOARDING_STEPS[Math.min(step, total - 1)]
  const isLast = step >= total - 1
  const backgroundUrl = homeBackgroundUrl(characterId, new Date().getHours())

  // 開始後、ステップが変わるたびに現在のセリフを読む（事前収録があれば即座に鳴る＝STEP3b）。
  // 1枚目は「はい／いいえ」を押した直後＝`primeAudio()` の直後なので自動再生は通る。
  useEffect(() => {
    if (!started) return
    void speakLine(current)
  }, [started, step, current])

  // 最初に音声の ON/OFF をやさしく選んでもらう。「はい」のタップの中で自動再生をアンロックする
  // （音を鳴らせない場所で開く人が、コレットが喋り出す前に静かに始められるように）。
  const begin = (withVoice: boolean) => {
    setVoice(withVoice) // 選択を永続（あとで 🔊 トグルで変更できる）
    if (withVoice) {
      primeAudio() // ユーザー操作の中で永続 <audio> をアンロック
      // オンボ中に喋る固定セリフの音声をここで一括で温めておく（数十KB×7）。
      // 初対面から「つぎへ」を連打しても、どの1枚も待たずに声が出る状態にする。
      preloadPartVoice(characterId, SPOKEN_FIXED_LINES)
    }
    setPhase('steps') // 前置きなしでコレットの「はじめまして！」へ
  }
  const handleNext = () => {
    if (!isLast) {
      next()
      return
    }
    // 最後＝本編へ手渡し。撮影ガイド（phase='shoot'）に移してカメラを開く。
    stopSpeaking()
    beginShoot()
    go('camera')
  }
  const handleSkip = () => {
    stopSpeaking()
    finish()
  }

  return (
    <div className="absolute inset-0 z-[60] overflow-hidden">
      {/* 背景＝ホームと同じ時間帯背景を敷く（新規アート不要）。無ければ淡いグラデ。 */}
      {backgroundUrl ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${backgroundUrl})` }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-lavender/30 to-mint/20" />
      )}
      {/* 読みやすさのためのスクリム。 */}
      <div aria-hidden className="absolute inset-0 bg-white/45 backdrop-blur-[2px]" />

      <div className="relative flex h-full flex-col items-center justify-between px-6 py-8 text-center">
        {/* 上：進行ドット（開始後だけ）＋スキップ。 */}
        <div className="flex h-6 w-full max-w-xs items-center justify-between">
          <div className="flex gap-1.5">
            {started &&
              ONBOARDING_STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-4 bg-lavender' : 'w-1.5 bg-slate-300'
                  }`}
                />
              ))}
          </div>
          {started && !isLast && (
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs font-bold text-slate-400 transition active:scale-95"
            >
              とばす
            </button>
          )}
        </div>

        {/* 中：段によって中身が変わる。`ask` は音声の質問だけ（背景＝木のうろの部屋が第一印象になる）、
            `steps` でコレットの姿とセリフが出る。 */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          {phase === 'ask' && (
            <div className="flex w-full max-w-xs flex-col items-center gap-4">
              <p className="text-lg font-bold text-slate-700">
                音声を再生しますか？
                <span className="mt-1 block text-xs font-bold text-slate-400">
                  （あとで変更できます）
                </span>
              </p>
              <div className="flex w-full gap-2">
                <button
                  type="button"
                  onClick={() => begin(true)}
                  aria-label="音声を再生してはじめる"
                  className="flex-1 rounded-full bg-lavender py-3.5 text-base font-bold text-white shadow-pop transition active:scale-95"
                >
                  はい
                </button>
                <button
                  type="button"
                  onClick={() => begin(false)}
                  aria-label="音声なしではじめる"
                  className="flex-1 rounded-full bg-white py-3.5 text-base font-bold text-slate-600 shadow-pop ring-1 ring-slate-200 transition active:scale-95"
                >
                  いいえ
                </button>
              </div>
            </div>
          )}

          {started && (
            <>
              <div className="rounded-3xl bg-white/85 px-5 py-4 shadow-pop">
                <p className="max-w-xs text-base font-bold leading-relaxed text-slate-700">
                  {current.text}
                </p>
              </div>
              <Sprite2DRenderer
                characterId={characterId}
                expression={current.expression}
                size="lg"
                animateKey={step}
                level={1}
              />
            </>
          )}
        </div>

        {/* 下：主ボタン。`ask` の間は置かない（音声の選択だけに集中させる）。 */}
        <div className="flex w-full max-w-xs shrink-0 flex-col items-center gap-2">
          {started && (
            <button
              type="button"
              onClick={handleNext}
              className={`w-full rounded-full py-3.5 text-base font-bold shadow-pop transition active:scale-95 ${
                isLast ? 'bg-mint text-slate-900' : 'bg-lavender text-white'
              }`}
            >
              {isLast ? 'カメラをひらく！' : 'つぎへ'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
