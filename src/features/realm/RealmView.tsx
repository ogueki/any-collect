import { useCallback, useEffect, useRef, useState } from 'react'
import { useCodexStore } from '../../store/codexStore'
import type { Item } from '../../types'

/**
 * 妖精界（コレットの世界・v2・STEP1f）。窯で作った透過アイテムが accent として出現する単一シーン。
 * 背景は STEP1 プレースホルダ（Tailwind グラデ＝本番の世界観アートは後日ユーザーの craft）。
 * アイテムは正規化座標 realmX/Y で絶対配置し、ドラッグで移動→永続（codexStore.updatePlacement）。
 * 未配置のアイテムはマウント時に id 由来の擬似ランダム座標へ自動配置（＝コレットが置く）。
 * 画像は透過 data URL なので object URL 不要。
 */

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** id から決定的に散らばる座標（0..1・端を避ける）。同じアイテムは毎回同じ初期位置。 */
function placementFromId(id: string): { x: number; y: number } {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const a = (h >>> 0) / 4294967295
  const h2 = Math.imul(h ^ 0x9e3779b9, 2654435761)
  const b = (h2 >>> 0) / 4294967295
  return { x: 0.15 + a * 0.7, y: 0.25 + b * 0.55 }
}

export default function RealmView() {
  const items = useCodexStore((s) => s.items)
  const load = useCodexStore((s) => s.load)
  const updatePlacement = useCodexStore((s) => s.updatePlacement)
  const remove = useCodexStore((s) => s.remove)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; startX: number; startY: number } | null>(null)
  const movedRef = useRef(false)
  const placingRef = useRef(false)
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [selected, setSelected] = useState<Item | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  // 未配置アイテムを自動配置（＝コレットが置く）。配置すると items が変わり再実行するが、
  // 配置済みになれば unplaced が空になって収束する。多重実行は placingRef で防ぐ。
  useEffect(() => {
    const unplaced = items.filter((it) => it.realmX == null || it.realmY == null)
    if (unplaced.length === 0 || placingRef.current) return
    placingRef.current = true
    void (async () => {
      try {
        for (const it of unplaced) {
          const { x, y } = placementFromId(it.id)
          await updatePlacement(it.id, x, y)
        }
      } finally {
        placingRef.current = false
      }
    })()
  }, [items, updatePlacement])

  const normFromPointer = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 }
    return {
      x: clamp((clientX - rect.left) / rect.width, 0.06, 0.94),
      y: clamp((clientY - rect.top) / rect.height, 0.08, 0.92),
    }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent, item: Item) => {
    dragRef.current = { id: item.id, startX: e.clientX, startY: e.clientY }
    movedRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragPos({ id: item.id, x: item.realmX ?? 0.5, y: item.realmY ?? 0.5 })
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (!movedRef.current) {
        if (Math.abs(e.clientX - d.startX) < 4 && Math.abs(e.clientY - d.startY) < 4) return
        movedRef.current = true
      }
      const { x, y } = normFromPointer(e.clientX, e.clientY)
      setDragPos({ id: d.id, x, y })
    },
    [normFromPointer],
  )

  const onPointerUp = useCallback(
    (item: Item) => {
      const d = dragRef.current
      dragRef.current = null
      if (!d) return
      if (movedRef.current && dragPos) {
        void updatePlacement(item.id, dragPos.x, dragPos.y)
      } else {
        setSelected(item) // 動かなければタップ＝詳細
      }
      setDragPos(null)
    },
    [dragPos, updatePlacement],
  )

  const handleDelete = useCallback(async () => {
    if (!selected || deleting) return
    setDeleting(true)
    try {
      await remove(selected.id)
      setSelected(null)
    } finally {
      setDeleting(false)
    }
  }, [selected, deleting, remove])

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      {/* 世界シーン（プレースホルダ背景） */}
      <div
        ref={containerRef}
        className="relative aspect-[3/4] w-full max-w-xs overflow-hidden rounded-3xl shadow-pop"
        style={{ background: 'linear-gradient(to bottom, #dbeafe 0%, #ede9fe 45%, #d1fae5 100%)' }}
      >
        {/* 空の飾り＆地面（簡易） */}
        <div className="pointer-events-none absolute right-4 top-4 text-2xl opacity-80">☀️</div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-emerald-200/80 to-transparent" />

        {items.map((item) => {
          const pos =
            dragPos && dragPos.id === item.id
              ? dragPos
              : { x: item.realmX ?? 0.5, y: item.realmY ?? 0.5 }
          const isDragging = dragPos?.id === item.id
          return (
            <button
              key={item.id}
              type="button"
              onPointerDown={(e) => onPointerDown(e, item)}
              onPointerMove={onPointerMove}
              onPointerUp={() => onPointerUp(item)}
              className="absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 touch-none select-none transition-transform active:scale-110"
              style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, zIndex: isDragging ? 10 : 1 }}
            >
              <img
                src={item.iconUrl}
                alt={item.name}
                draggable={false}
                className="h-full w-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
              />
            </button>
          )
        })}

        {/* 空状態 */}
        {items.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm font-bold text-slate-500">まだ何もない世界…</p>
            <p className="text-xs text-slate-500">妖精の窯でアイテムを作ると、ここに増えていくよ</p>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400">
        アイテムをドラッグで動かせるよ・タップで詳細（遊ぶはメニューから）
      </p>

      {/* 詳細（名前＋説明＋削除） */}
      {selected && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/60 px-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-xs rounded-3xl bg-white p-4 text-slate-800 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto aspect-square w-full max-w-[12rem]">
              <img
                src={selected.iconUrl}
                alt={selected.name}
                className="h-full w-full object-contain"
              />
            </div>
            <h2 className="mt-3 text-center font-display text-xl font-bold">{selected.name}</h2>
            <p className="mt-2 whitespace-pre-wrap text-center text-sm text-slate-600">
              {selected.description}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full bg-mint px-6 py-2 font-bold text-slate-900 shadow-pop transition active:scale-95"
              >
                とじる
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-400 transition active:scale-95 disabled:opacity-50"
              >
                {deleting ? '削除中…' : '削除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
