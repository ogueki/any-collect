import { type ReactNode } from 'react'
import { useAppStore } from '../store/appStore'
import { useAffinityStore, levelForScore } from '../store/affinityStore'
import { primeAudio } from '../lib/audio/useSpeak'
import { SoundOnIcon, SoundOffIcon } from './icons'
import Sprite2DRenderer from '../lib/character/Sprite2DRenderer'
import { useFairyReaction } from '../lib/character/useFairyReaction'
import { ShellFairyContext } from './shellFairy'

/**
 * 作業画面（図鑑・アルバム・窯・妖精界）の共通シェル。
 * 上部＝左に「ホームへ戻る」／中央にタイトル／右に声 ON/OFF（全画面で同じ位置＝導線の共通化）。
 * 右下に **コレット（1体）** を常駐させ、子ビューからの感情リアクションを表示する
 * （各ビューが自前スプライトを描く二重化をやめ、シェルに一本化＝mock の「作業画面＝右下コレット」）。
 * 反応ハンドルの context/hook は `shellFairy.ts` に分離（react-refresh 制約）。
 * 中身は自己完結したビュー（`CollectionView` 等）をそのまま流し込む。
 */
export default function WorkingScreen({ title, children }: { title: string; children: ReactNode }) {
  const go = useAppStore((s) => s.go)
  const voiceEnabled = useAppStore((s) => s.voiceEnabled)
  const toggleVoice = useAppStore((s) => s.toggleVoice)
  const characterId = useAppStore((s) => s.characterId)
  const affinityLevel = useAffinityStore((s) => levelForScore(s.score))
  const { expression, animateKey, fire } = useFairyReaction()

  return (
    <ShellFairyContext.Provider value={{ fire }}>
      <div className="relative flex h-full flex-col bg-gradient-to-b from-sky-50 via-violet-50 to-emerald-50">
        <header className="flex shrink-0 items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => go('home')}
            aria-label="ホームへ戻る"
            className="rounded-full bg-white/90 px-3 py-2 text-sm font-bold text-slate-500 shadow-pop transition active:scale-95"
          >
            ← ホーム
          </button>
          <h1 className="flex-1 text-center font-display text-lg font-bold text-slate-700">{title}</h1>
          <button
            type="button"
            onClick={() => {
              if (!voiceEnabled) primeAudio()
              toggleVoice()
            }}
            aria-label={voiceEnabled ? '声をオフにする' : '声をオンにする'}
            className="rounded-full bg-white/90 p-2 text-slate-600 shadow-pop transition active:scale-95"
          >
            {voiceEnabled ? <SoundOnIcon className="h-5 w-5" /> : <SoundOffIcon className="h-5 w-5" />}
          </button>
        </header>

        {/* 中身。右下コレットに隠れないよう下に余白を持たせる。 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-36">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </div>

        {/* 右下コレット（作業画面共通）。pointer-events-none で下のコンテンツ操作を邪魔しない。 */}
        <div className="pointer-events-none absolute bottom-3 right-3">
          <Sprite2DRenderer
            characterId={characterId}
            expression={expression ?? 'neutral'}
            size="sm"
            animateKey={animateKey}
            level={affinityLevel}
          />
        </div>
      </div>
    </ShellFairyContext.Provider>
  )
}
