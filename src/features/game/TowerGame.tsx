import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useCodexStore } from '../../store/codexStore'
import { useGameStore } from '../../store/gameStore'
import { useAffinityStore, levelForScore } from '../../store/affinityStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import {
  createTowerGame,
  type TowerGameHandle,
  type TowerItem,
  type TowerResult,
  type TurnActor,
} from './towerEngine'

/**
 * オマケ：アイテムでタワーバトル。メニューから起動するフルスクリーン overlay。
 * 集めた透過アイテムをドラッグで狙って落とし、物理でグラグラ積む。
 * モード＝**ソロ**（積めた数を競う・ベストは localStorage）／**VSコレット**（交互ターンで
 * 先に台から落とした側が負け）。物理と描画は `towerEngine`（matter.js 遅延ロード）に委譲。
 */

type Mode = 'menu' | 'solo' | 'vs'

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

  const [mode, setMode] = useState<Mode>('menu')
  const [score, setScore] = useState(0)
  const [turn, setTurn] = useState<TurnActor>('player')
  const [result, setResult] = useState<TowerResult | null>(null)
  const [isNewBest, setIsNewBest] = useState(false)

  // 起動時に図鑑（アイテム）を読み込む（たからばこと同じ遅延ロード idiom）。
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

  // エンジン生成／破棄。モードを選んだら作る（StrictMode の再マウントにも耐える）。
  // callbacks が参照するのは安定な関数（setState 群・fire・reportScore）だけなので直接渡してよい。
  useEffect(() => {
    if (mode === 'menu') return
    const canvas = canvasRef.current
    if (!canvas || pool.length === 0) return
    let handle: TowerGameHandle | null = null
    let disposed = false
    void (async () => {
      try {
        const h = await createTowerGame(
          canvas,
          pool,
          {
            onScore: (s) => setScore(s),
            onReaction: (k) => fire(k === 'stack' ? 'excited' : 'sad'),
            onTurn: (t) => setTurn(t),
            onGameOver: (r) => {
              setResult(r)
              if (r.mode === 'solo') {
                setIsNewBest(reportScore(r.stacked))
                fire('sad')
              } else {
                fire(r.winner === 'colette' ? 'excited' : 'sad')
              }
            },
          },
          { mode },
        )
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
  }, [mode, pool, fire, reportScore])

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
    setResult(null)
    setIsNewBest(false)
    setScore(0)
    setTurn('player')
    gameRef.current?.restart()
  }, [])
  const backToMenu = useCallback(() => {
    setResult(null)
    setIsNewBest(false)
    setScore(0)
    setMode('menu')
  }, [])

  const empty = pool.length === 0
  const coletteTurn = mode === 'vs' && turn === 'colette' && !result
  const dropDisabled = !!result || coletteTurn

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
        {mode !== 'menu' && (
          <div className="flex items-center gap-3 text-slate-700">
            <span className="font-display text-lg font-bold">つんだ数：{score}</span>
            {mode === 'solo' && <span className="text-xs text-slate-500">ベスト {best}</span>}
          </div>
        )}
      </div>

      {/* 本体 */}
      <div className="relative min-h-0 flex-1">
        {empty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
            <p className="text-lg font-bold text-slate-600">まだ積むものがない…</p>
            <p className="text-sm text-slate-500">
              図鑑からアイテムを召喚すると、ここで積んで遊べるよ
            </p>
          </div>
        ) : mode === 'menu' ? (
          /* モード選択 */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8">
            <p className="font-display text-2xl font-bold text-slate-700">つみあげタワー</p>
            <p className="-mt-2 text-sm text-slate-500">集めたアイテムを積んで遊ぼう</p>
            <button
              type="button"
              onClick={() => setMode('solo')}
              className="w-56 rounded-2xl bg-mint px-6 py-3 font-display text-lg font-bold text-slate-900 shadow-pop transition active:scale-95"
            >
              ひとりで積む
            </button>
            <button
              type="button"
              onClick={() => setMode('vs')}
              className="w-56 rounded-2xl bg-lavender px-6 py-3 font-display text-lg font-bold text-white shadow-pop transition active:scale-95"
            >
              コレットと対戦
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            className="absolute inset-0 h-full w-full touch-none"
          />
        )}

        {/* VS：手番表示 */}
        {mode === 'vs' && !result && !empty && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span
              className={`rounded-full px-4 py-1 text-sm font-bold shadow-pop ${
                turn === 'player' ? 'bg-mint text-slate-900' : 'bg-lavender/90 text-white'
              }`}
            >
              {turn === 'player' ? 'あなたのばん' : 'コレットが考えてるよ…'}
            </span>
          </div>
        )}

        {/* 隅のコレット（積む=excited／崩壊・負け=sad／勝ち=excited） */}
        {mode !== 'menu' && !empty && (
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
        {result && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 px-6">
            <div className="w-full max-w-xs rounded-3xl bg-white p-5 text-center text-slate-800 shadow-pop">
              {result.mode === 'solo' ? (
                <>
                  <p className="font-display text-2xl font-bold">くずれちゃった！</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {result.stacked} 個つめたよ{isNewBest && ' 🎉'}
                  </p>
                  {isNewBest && (
                    <p className="mt-1 text-sm font-bold text-rose-500">さいこう記録こうしん！</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-display text-2xl font-bold">
                    {result.winner === 'player' ? 'あなたのかち！ 🎉' : 'コレットのかち！'}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {result.winner === 'player'
                      ? 'コレットより上手に積めたね'
                      : 'コレットのほうが上手だったみたい'}
                  </p>
                </>
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
                  onClick={backToMenu}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-500 transition active:scale-95"
                >
                  モードをかえる
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 操作：落とす */}
      {mode !== 'menu' && !empty && (
        <div className="flex shrink-0 flex-col items-center gap-1 px-4 pb-6 pt-2">
          <p className="text-xs text-slate-500">
            {coletteTurn ? 'コレットのばんだよ…' : '画面をドラッグで狙って、落とすボタンでドロップ'}
          </p>
          <button
            type="button"
            onClick={handleDrop}
            disabled={dropDisabled}
            className="rounded-full bg-lavender px-10 py-3 font-display text-lg font-bold text-white shadow-pop transition active:scale-95 disabled:opacity-50"
          >
            落とす
          </button>
        </div>
      )}
    </div>
  )
}
