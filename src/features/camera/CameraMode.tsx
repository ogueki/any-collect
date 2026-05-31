/**
 * カメラモード（プレースホルダー）。
 * ライブ撮影 → AI アイテム化（STEP3）・風景コメント（STEP6）をこの中に実装していく。
 * 妖精は画面右下に小さく表示する。
 */
export default function CameraMode() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 bg-slate-900/90 px-6 text-center text-white">
      <div>
        <h1 className="font-display text-3xl font-bold text-mint">カメラモード</h1>
        <p className="mt-2 max-w-xs text-slate-300">
          見つけたモノを撮ってアイテム化するモード。ライブ撮影と AI 生成は STEP3 で実装します。
        </p>
      </div>

      {/* 妖精は画面右下に小さく */}
      <div className="absolute bottom-4 right-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/80 text-4xl shadow-pop">
        🧚
      </div>
    </div>
  )
}
