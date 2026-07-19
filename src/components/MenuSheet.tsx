import { useAppStore } from '../store/appStore'

/**
 * メニュー（ボトムシート）。ホームの「メニュー」から開く、二次機能の受け皿。
 * 現状＝妖精の窯（2素材合成）・アルバム・ゲーム（積んで/とんで）。将来機能はここに追加する。
 */
export default function MenuSheet() {
  const open = useAppStore((s) => s.menuOpen)
  const close = useAppStore((s) => s.closeMenu)
  const go = useAppStore((s) => s.go)
  const openGame = useAppStore((s) => s.openGame)

  return (
    <>
      <div
        onClick={close}
        aria-hidden={!open}
        className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        role="dialog"
        aria-label="メニュー"
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl bg-white px-4 pb-7 pt-3 shadow-pop transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        <h2 className="mb-2 font-display text-sm font-bold text-slate-700">メニュー</h2>
        <MenuRow title="妖精の窯" desc="アイテムを2つ混ぜて合成" onClick={() => go('kiln')} />
        <MenuRow title="アルバム" desc="撮った思い出の写真" onClick={() => go('album')} />
        <MenuRow title="積んで遊ぶ" desc="アイテムでタワー" onClick={() => openGame('tower')} />
        <MenuRow title="とんで遊ぶ" desc="アイテムでフラッピー" onClick={() => openGame('flappy')} />
      </div>
    </>
  )
}

function MenuRow({
  title,
  desc,
  onClick,
}: {
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition active:bg-slate-100"
    >
      <div className="flex flex-col">
        <span className="text-sm font-bold text-slate-700">{title}</span>
        <span className="text-xs text-slate-400">{desc}</span>
      </div>
    </button>
  )
}
