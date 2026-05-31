import { useAppStore } from '../../store/appStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'

/**
 * ホームモード。
 * 妖精を中央に大きく表示する。会話（STEP2）・図鑑（STEP4）・妖精の窯（STEP7）を
 * この中に実装していく。
 */
export default function HomeMode() {
  const characterId = useAppStore((s) => s.characterId)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <Sprite2DRenderer characterId={characterId} expression="neutral" size="lg" />
      <div>
        <h1 className="font-display text-3xl font-bold text-lavender">ホームモード</h1>
        <p className="mt-2 max-w-xs text-slate-500">
          妖精とまったり過ごすモード。会話・図鑑・妖精の窯はこの先の STEP で実装します。
        </p>
      </div>
    </div>
  )
}
