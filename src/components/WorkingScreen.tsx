import type { ReactNode } from 'react'
import { useAppStore } from '../store/appStore'
import { primeAudio } from '../lib/audio/useSpeak'

/**
 * 作業画面（図鑑・アルバム・窯・妖精界）の共通シェル。
 * 上部＝左に「ホームへ戻る」／中央にタイトル／右に声 ON/OFF（全画面で同じ位置＝導線の共通化）。
 * 中身は自己完結したビュー（`CollectionView` 等）をそのまま流し込む。
 * 右下コレットの共通化・アイコン化は後続スライスで対応（今は構造を先に通す）。
 */
export default function WorkingScreen({ title, children }: { title: string; children: ReactNode }) {
  const go = useAppStore((s) => s.go)
  const voiceEnabled = useAppStore((s) => s.voiceEnabled)
  const toggleVoice = useAppStore((s) => s.toggleVoice)

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-sky-50 via-violet-50 to-emerald-50">
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
          className="rounded-full bg-white/90 px-3 py-2 text-lg shadow-pop transition active:scale-95"
        >
          {voiceEnabled ? '🔊' : '🔇'}
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
