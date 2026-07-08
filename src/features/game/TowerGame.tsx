import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useCodexStore } from '../../store/codexStore'
import { useGameStore } from '../../store/gameStore'
import { useAffinityStore, levelForScore } from '../../store/affinityStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import { createTowerGame, type TowerGameHandle, type TowerItem } from './towerEngine'

/**
 * オマケ：アイテムでタワーバトル（Phase 1・ソロ・エンドレス）。
 * 妖精界から起動するフルスクリーン overlay。集めた透過アイテムをドラッグで狙って落とし、
 * 物理でグラグラ積む。場外に落ちたら終了＝積めた数がスコア（ベストは localStorage）。
 * 物理と描画は `towerEngine`（matter.js 遅延ロード）に委譲し、ここは UI とライフサイクルだけ。
 */

export default function TowerGame({ onClose }: { onClose: () => void }) {
  const characterId = useAppStore((s) => s.characterId)
  const items = useCodexStore((s) => s.items)
  const load = useCodexStore((s) => s.load)
  const best = useGameStore((s) => s.towerBest)
  const reportScore = useGameStore((s) => s.reportTowerScore)
  const affinityLevel = useAffinityStore((s) => levelForScore(s.score))
  const { expression, animateKey, fire } = useFairyReaction()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<TowerGameHandle | null>(null)

  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [isNewBest, setIsNewBest] = useState(false)

  // 起動時に図鑑（アイテム）を読み込む（妖精界と同じ遅延ロード idiom）。
  useEffect(() => {
    void load()
  }, [load])

  const pool = useMemo<TowerItem[]>(
    () =>
      items
        .filter((it) => it.iconUrl)
        .map((it) => ({ id: it.id, iconUrl: it.iconUrl, name: it.name })),
    [items],
  )

  // エンジン生成／破棄。pool が用意できたら1回作る（StrictMode の再マウントにも耐える）。
  // callbacks が参照するのは安定な関数（setState 群・fire・reportScore）だけなので直接渡してよい。
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || pool.length === 0) return
    let handle: TowerGameHandle | null = null
    let disposed = false
    void (async () => {
      try {
        const h = await createTowerGame(canvas, pool, {
          onScore: (s) => setScore(s),
          onReaction: (k) => fire(k === 'stack' ? 'excited' : 'sad'),
          onGameOver: (f) => {
            setScore(f)
            setGameOver(true)
            setIsNewBest(reportScore(f))
          },
        })
        if (disposed) {
          h.destroy()
          return
        }
        handle = h
        gameRef.current = h
      } catch {
        // 生成失敗（matter ロード等）＝オマケなので静かに閉じる導線に任せる。
      }
    })()
    return () => {
      disposed = true
      handle?.destroy()
      gameRef.current = null
    }
  }, [pool, fire, reportScore])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    gameRef.current?.aimAt(e.clientX)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.buttons === 0) return
    gameRef.current?.aimAt(e.clientX)
  }, [])

  const handleDrop = useCallback(() => gameRef.current?.drop(), [])
  const handleRestart = useCallback(() => {
    setGameOver(false)
    setIsNewBest(false)
    setScore(0)
    gameRef.current?.restart()
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
        <div className="flex items-center gap-3 text-slate-700">
          <span className="font-display text-lg font-bold">つんだ数：{score}</span>
          <span className="text-xs text-slate-500">ベスト {best}</span>
        </div>
      </div>

      {/* プレイエリア */}
      <div className="relative min-h-0 flex-1">
        {empty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
            <p className="text-lg font-bold text-slate-600">まだ積むものがない…</p>
            <p className="text-sm text-slate-500">
              妖精の窯でアイテムを作ると、ここで積んで遊べるよ
            </p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            className="absolute inset-0 h-full w-full touch-none"
          />
        )}

        {/* 隅のコレット（積む＝excited／崩壊＝sad） */}
        {!empty && (
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

        {/* ゲームオーバー */}
        {gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 px-6">
            <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-center text-slate-800 shadow-pop">
              <p className="font-display text-2xl font-bold">くずれちゃった！</p>
              <p className="mt-2 text-sm text-slate-600">
                {score} 個つめたよ{isNewBest && ' 🎉'}
              </p>
              {isNewBest && (
                <p className="mt-1 text-sm font-bold text-rose-500">さいこう記録こうしん！</p>
              )}
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="rounded-full bg-mint px-6 py-2 font-bold text-slate-900 shadow-pop transition active:scale-95"
                >
                  もう一回
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-400 transition active:scale-95"
                >
                  やめる
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 操作：落とす */}
      {!empty && (
        <div className="flex shrink-0 flex-col items-center gap-1 px-4 pb-6 pt-2">
          <p className="text-xs text-slate-500">画面をドラッグで狙って、落とすボタンでドロップ</p>
          <button
            type="button"
            onClick={handleDrop}
            disabled={gameOver}
            className="rounded-full bg-lavender px-10 py-3 font-display text-lg font-bold text-white shadow-pop transition active:scale-95 disabled:opacity-50"
          >
            落とす
          </button>
        </div>
      )}
    </div>
  )
}
