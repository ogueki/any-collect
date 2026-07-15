import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useCodexStore } from '../../store/codexStore'
import { useGameStore } from '../../store/gameStore'
import { useAffinityStore, levelForScore } from '../../store/affinityStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import { createFlappyGame, type FlappyGameHandle, type FlappyItem } from './flappyEngine'

/**
 * オマケ②：集めた透過アイテムでフラッピー風。妖精界から起動するフルスクリーン overlay。
 * まず主役アイテムを選び、タップではばたいて妖精界トーンの柱の隙間をくぐる。ソロのスコアアタック
 * （ベストは localStorage）。物理と描画は `flappyEngine`（固定タイムステップ）に委譲。
 */

export default function FlappyGame({ onClose }: { onClose: () => void }) {
  const characterId = useAppStore((s) => s.characterId)
  const items = useCodexStore((s) => s.items)
  const load = useCodexStore((s) => s.load)
  const best = useGameStore((s) => s.flappyBest)
  const reportScore = useGameStore((s) => s.reportFlappyScore)
  const affinityLevel = useAffinityStore((s) => levelForScore(s.score))
  const { expression, animateKey, fire } = useFairyReaction()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<FlappyGameHandle | null>(null)

  const [picked, setPicked] = useState<FlappyItem | null>(null)
  const [score, setScore] = useState(0)
  const [result, setResult] = useState<number | null>(null)
  const [isNewBest, setIsNewBest] = useState(false)

  // 起動時に図鑑（アイテム）を読み込む（妖精界と同じ遅延ロード idiom）。
  useEffect(() => {
    void load()
  }, [load])

  const pool = useMemo<FlappyItem[]>(
    () =>
      items
        .filter((it) => it.iconUrl)
        .map((it) => ({ id: it.id, iconUrl: it.iconUrl, name: it.name })),
    [items],
  )

  // アイテムを選んだらエンジン生成／破棄（StrictMode の再マウントにも耐える）。
  useEffect(() => {
    if (!picked) return
    const canvas = canvasRef.current
    if (!canvas) return
    let handle: FlappyGameHandle | null = null
    let disposed = false
    void (async () => {
      try {
        const h = await createFlappyGame(canvas, picked, {
          onScore: (s) => setScore(s),
          onReaction: (k) => fire(k === 'score' ? 'excited' : 'sad'),
          onGameOver: (s) => {
            setResult(s)
            setIsNewBest(reportScore(s))
          },
        })
        if (disposed) {
          h.destroy()
          return
        }
        handle = h
        gameRef.current = h
      } catch {
        // 生成失敗＝オマケなので静かに閉じる導線に任せる。
      }
    })()
    return () => {
      disposed = true
      handle?.destroy()
      gameRef.current = null
    }
  }, [picked, fire, reportScore])

  const handleTap = useCallback(() => {
    if (result != null) return
    gameRef.current?.flap()
  }, [result])

  const handleRestart = useCallback(() => {
    setResult(null)
    setIsNewBest(false)
    setScore(0)
    gameRef.current?.restart()
  }, [])

  const changeItem = useCallback(() => {
    setResult(null)
    setIsNewBest(false)
    setScore(0)
    setPicked(null)
  }, [])

  const empty = pool.length === 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-sky-100 via-violet-100 to-emerald-100">
      {/* ヘッダ：閉じる＋スコア */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="とじる"
          className="rounded-full bg-white/80 px-3 py-1.5 text-sm font-bold text-slate-500 shadow-pop transition active:scale-95"
        >
          ✕ とじる
        </button>
        {picked && (
          <div className="flex items-center gap-3 text-slate-700">
            <span className="font-display text-lg font-bold">スコア：{score}</span>
            <span className="text-xs text-slate-500">ベスト {best}</span>
          </div>
        )}
      </div>

      {/* 本体 */}
      <div className="relative min-h-0 flex-1">
        {empty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
            <p className="text-lg font-bold text-slate-600">まだ飛ぶものがない…</p>
            <p className="text-sm text-slate-500">図鑑からアイテムを召喚すると、ここで飛べるよ</p>
          </div>
        ) : !picked ? (
          /* 主役アイテム選択 */
          <div className="absolute inset-0 flex flex-col items-center gap-3 px-6 pt-2">
            <p className="font-display text-2xl font-bold text-slate-700">とんでくぐろう</p>
            <p className="-mt-1 text-sm text-slate-500">飛ぶアイテムをえらんでね</p>
            <div className="grid w-full max-w-sm grid-cols-3 gap-3 overflow-y-auto pb-6">
              {pool.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setPicked(it)}
                  className="flex flex-col items-center gap-1 rounded-2xl bg-white/70 p-2 shadow-pop transition active:scale-95"
                >
                  <img
                    src={it.iconUrl}
                    alt={it.name}
                    className="h-16 w-16 object-contain drop-shadow"
                  />
                  <span className="line-clamp-1 text-[11px] text-slate-500">{it.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onPointerDown={handleTap}
            className="absolute inset-0 h-full w-full touch-none"
          />
        )}

        {/* 隅のコレット（くぐる=excited／墜落=sad） */}
        {picked && !empty && (
          <div className="pointer-events-none absolute bottom-2 right-2">
            <Sprite2DRenderer
              characterId={characterId}
              expression={expression ?? 'happy'}
              size="sm"
              animateKey={animateKey}
              level={affinityLevel}
            />
          </div>
        )}

        {/* 終了カード */}
        {result != null && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 px-6">
            <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-center text-slate-800 shadow-pop">
              <p className="font-display text-2xl font-bold">ぶつかっちゃった！</p>
              <p className="mt-2 text-sm text-slate-600">
                {result} 回くぐれたよ{isNewBest && ' 🎉'}
              </p>
              {isNewBest && (
                <p className="mt-1 text-sm font-bold text-rose-500">さいこう記録こうしん！</p>
              )}
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="rounded-full bg-mint px-5 py-2 text-sm font-bold text-slate-900 shadow-pop transition active:scale-95"
                >
                  もう一回
                </button>
                <button
                  type="button"
                  onClick={changeItem}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-500 transition active:scale-95"
                >
                  アイテムをかえる
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 操作ヒント */}
      {picked && !empty && result == null && (
        <div className="flex shrink-0 flex-col items-center gap-1 px-4 pb-6 pt-2">
          <p className="text-xs text-slate-500">画面をタップではばたく</p>
        </div>
      )}
    </div>
  )
}
