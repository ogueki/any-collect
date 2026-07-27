import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useOnboardingStore } from '../../store/onboardingStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import { homeBackgroundUrl } from '../../lib/character/homeBackground'
import { speak, primeAudio, stopSpeaking } from '../../lib/audio/useSpeak'
import { ONBOARDING_STEPS, WHISPER_LINE } from './script'

/**
 * ささやきを見せている時間（ms）。過ぎたら自動でコレット登場へ（タップでスキップ可）。
 * **尺のノブはここ1つ**＝濃さの揺れ（`animate-whisper`）の秒数もこの値をインラインで流し込む。
 */
const WHISPER_MS = 4500

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
  const setVoice = useAppStore((s) => s.setVoice)
  const step = useOnboardingStore((s) => s.step)
  const next = useOnboardingStore((s) => s.next)
  const beginShoot = useOnboardingStore((s) => s.beginShoot)
  const finish = useOnboardingStore((s) => s.finish)

  /**
   * 画面の段：`ask`＝音声の選択だけ（世界の説明はしない＝話者のいないナレーションを置かない）→
   * `whisper`＝遠くの声だけが届くワンクッション（ボタンなし・自動で進む）→ `steps`＝コレット登場。
   */
  const [phase, setPhase] = useState<'ask' | 'whisper' | 'steps'>('ask')
  const started = phase === 'steps'

  const total = ONBOARDING_STEPS.length
  const current = ONBOARDING_STEPS[Math.min(step, total - 1)]
  const isLast = step >= total - 1
  const backgroundUrl = homeBackgroundUrl(characterId, new Date().getHours())

  // ささやき＝ボタンを置かずに時間で流す（ここに「つぎへ」を付けるとカードが1枚増えただけになる）。
  useEffect(() => {
    if (phase !== 'whisper') return
    void speak(WHISPER_LINE.text, { direction: WHISPER_LINE.direction })
    const timer = setTimeout(() => setPhase('steps'), WHISPER_MS)
    return () => clearTimeout(timer)
  }, [phase])

  // 開始後、ステップが変わるたびに現在のセリフを動的TTSで読む（演技指示つき）。
  useEffect(() => {
    if (!started) return
    void speak(current.text, { expression: current.expression, direction: current.direction })
  }, [started, step, current])

  // 最初に音声の ON/OFF をやさしく選んでもらう。「はい」のタップの中で自動再生をアンロックする
  // （音を鳴らせない場所で開く人が、コレットが喋り出す前に静かに始められるように）。
  const begin = (withVoice: boolean) => {
    setVoice(withVoice) // 選択を永続（あとで 🔊 トグルで変更できる）
    if (withVoice) primeAudio() // ユーザー操作の中で永続 <audio> をアンロック
    setPhase('whisper')
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

      {/* ささやきの間だけ、どこをタップしても先へ進める（毎回きっちり待たされない＝入室演出と同じ扱い）。 */}
      <div
        onPointerDown={phase === 'whisper' ? () => setPhase('steps') : undefined}
        className="relative flex h-full flex-col items-center justify-between px-6 py-8 text-center"
      >
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
            `whisper` は遠くの声だけ、`steps` でようやくコレットの姿とセリフが出る。 */}
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

          {/* まだ姿は見えず、声だけが届く。白いカードに入れない＝「セリフ」でなく「気配」に見せる。 */}
          {phase === 'whisper' && (
            <p
              style={{ animationDuration: `${WHISPER_MS}ms` }}
              className="animate-whisper max-w-xs text-lg font-bold leading-loose tracking-[0.18em] text-slate-600 [text-shadow:0_0_12px_rgba(255,255,255,0.9)]"
            >
              {WHISPER_LINE.text}
            </p>
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

        {/* 下：主ボタン。`ask`/`whisper` の間は置かない（選択と気配だけに集中させる）。 */}
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
