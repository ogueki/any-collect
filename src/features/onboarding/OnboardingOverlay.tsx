import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useOnboardingStore } from '../../store/onboardingStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import { homeBackgroundUrl } from '../../lib/character/homeBackground'
import { speak, primeAudio, stopSpeaking } from '../../lib/audio/useSpeak'
import { ONBOARDING_STEPS } from './script'

/**
 * 初回オンボーディング（STEP4）＝**コレット主導の「最初の一回」**。
 * 別画面の説明会ではなく、コレット本人が喋りながら自己紹介→アプリの流れを案内し、
 * 最後に「カメラをひらく」で本編（撮る）へ手渡す。空っぽで放り出さない。
 *
 * 新規アートは無し：立ち絵・時間帯背景・声（動的TTS）はすべて既存を流用する。
 * 音声の自動再生は最初の操作（「はじめる」）でアンロックしてから読み上げる（iOS 対策）。
 * 固定音声（パートボイス）は後続 STEP3b＝ここでは都度生成のままでよい。
 */
export default function OnboardingOverlay() {
  const characterId = useAppStore((s) => s.characterId)
  const go = useAppStore((s) => s.go)
  const step = useOnboardingStore((s) => s.step)
  const next = useOnboardingStore((s) => s.next)
  const beginShoot = useOnboardingStore((s) => s.beginShoot)
  const finish = useOnboardingStore((s) => s.finish)

  // 「はじめる」を押すまでは音声をアンロックできない（自動再生ポリシー）。
  const [started, setStarted] = useState(false)

  const total = ONBOARDING_STEPS.length
  const current = ONBOARDING_STEPS[Math.min(step, total - 1)]
  const isLast = step >= total - 1
  const backgroundUrl = homeBackgroundUrl(characterId, new Date().getHours())

  // 開始後、ステップが変わるたびに現在のセリフを動的TTSで読む（演技指示つき）。
  useEffect(() => {
    if (!started) return
    void speak(current.text, { expression: current.expression, direction: current.direction })
  }, [started, step, current])

  const begin = () => {
    primeAudio() // ユーザー操作の中で永続 <audio> をアンロック
    setStarted(true)
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

        {/* 中：コレット＋セリフ。 */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
          <div className="rounded-3xl bg-white/85 px-5 py-4 shadow-pop">
            {started ? (
              <p className="max-w-xs text-base font-bold leading-relaxed text-slate-700">
                {current.text}
              </p>
            ) : (
              <p className="max-w-xs text-base font-bold leading-relaxed text-slate-700">
                はじめまして。コレットがきみを待ってるよ。
              </p>
            )}
          </div>
          <Sprite2DRenderer
            characterId={characterId}
            expression={started ? current.expression : 'excited'}
            size="lg"
            animateKey={started ? step : -1}
            level={1}
          />
        </div>

        {/* 下：主ボタン。 */}
        <div className="flex w-full max-w-xs shrink-0 flex-col items-center gap-2">
          {!started ? (
            <button
              type="button"
              onClick={begin}
              className="w-full rounded-full bg-lavender py-3.5 text-base font-bold text-white shadow-pop transition active:scale-95"
            >
              はじめる
            </button>
          ) : (
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
