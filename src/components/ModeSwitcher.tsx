import { useAppStore, type AppMode } from '../store/appStore'

const TABS: { mode: AppMode; label: string; icon: string }[] = [
  { mode: 'home', label: 'ホーム', icon: '🏠' },
  { mode: 'camera', label: 'カメラ', icon: '📷' },
]

export default function ModeSwitcher() {
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)

  return (
    <nav className="flex justify-center p-3">
      <div className="flex gap-1 rounded-full bg-white/80 p-1 shadow-pop backdrop-blur">
        {TABS.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            onClick={() => setMode(tab.mode)}
            className={`flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold transition ${
              mode === tab.mode
                ? 'bg-lavender text-white'
                : 'text-slate-500 hover:bg-lavender/20'
            }`}
          >
            <span aria-hidden>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
