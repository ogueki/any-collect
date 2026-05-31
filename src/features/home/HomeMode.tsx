/**
 * ホームモード（プレースホルダー）。
 * 会話（STEP2）・図鑑（STEP4）・妖精の窯（STEP7）をこの中に実装していく。
 */
export default function HomeMode() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-40 w-40 items-center justify-center rounded-full bg-white/70 text-6xl shadow-pop">
        🧚
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold text-lavender">ホームモード</h1>
        <p className="mt-2 max-w-xs text-slate-500">
          妖精とまったり過ごすモード。会話・図鑑・妖精の窯はこの先の STEP で実装します。
        </p>
      </div>
    </div>
  )
}
