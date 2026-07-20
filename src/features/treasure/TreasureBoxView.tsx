import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCodexStore } from '../../store/codexStore'
import { useAppStore } from '../../store/appStore'
import type { Item } from '../../types'
import TreasureOpening from './TreasureOpening'

/**
 * たからばこ（コレットの宝箱の中・v2・STEP5）。召喚/合成した透過アイテムが浮かぶ収納ビュー。
 * 見た目より中が広い「4次元空間」＝背景はコード生成（アート素材に依存しない）。
 * **画面いっぱいに敷く**（`WorkingScreen` の bleed／枠も影も無し＝没入感。実機フィードバック 2026-07-21）。
 *
 * アイテムは正規化座標 realmX/Y をアンカーに **ふわふわ漂い**（CSS の drift・id 由来の周期/位相で
 * 個体差）、掴むと漂いが止まってドラッグでき、離すと新しいアンカーを永続（codexStore.updatePlacement）。
 * 未配置のアイテムはマウント時に id 由来の擬似ランダム座標へ自動配置（＝コレットがしまう）。
 *
 * 永続フィールド名が realmX/Y なのは IndexedDB の既存データと揃えるため（たからばこ＝妖精界にある
 * 宝箱なので意味は変わらない）。画像は透過 data URL なので object URL 不要。
 */

/** 漂いの周期の範囲（秒）。個体ごとに散らして「全部が同じ動き」を避ける。 */
const DRIFT_MIN_S = 6
const DRIFT_MAX_S = 11

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * id から決定的な 0..1 の値を2つ作る（同じアイテムは毎回同じ初期位置・同じ漂い方）。
 * FNV の生の値は「似た文字列で出力も近い」ため、両方とも avalanche（xorshift＋乗算）に
 * 通してから使う。これを省くと連番 id で周期や座標が固まる。
 */
function mix32(x: number): number {
  let h = x | 0
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

function hash2(id: string): { a: number; b: number } {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return {
    a: mix32(h) / 4294967295,
    b: mix32(h ^ 0x9e3779b9) / 4294967295,
  }
}

/** id から決定的に散らばる座標（0..1・端を避ける）。 */
function placementFromId(id: string): { x: number; y: number } {
  const { a, b } = hash2(id)
  return { x: 0.15 + a * 0.7, y: 0.2 + b * 0.6 }
}

/** 漂いの style。負のディレイで位相をずらす＝全部が同時に同じ動きをしない。 */
function driftStyleFromId(id: string): { animationDuration: string; animationDelay: string } {
  const { a, b } = hash2(id)
  const duration = DRIFT_MIN_S + a * (DRIFT_MAX_S - DRIFT_MIN_S)
  return {
    animationDuration: `${duration.toFixed(2)}s`,
    animationDelay: `-${(b * duration).toFixed(2)}s`,
  }
}

/** 奥行き 0(奥)..1(手前)。手前ほど大きく・不透明・前面に。scale は控えめ＝視認性を保つ。 */
function depthFromId(id: string): { scale: number; opacity: number; z: number } {
  const { b } = hash2(id)
  return { scale: 0.84 + b * 0.32, opacity: 0.82 + b * 0.18, z: 1 + Math.round(b * 5) }
}

/**
 * 背景の星屑（決定的＝レンダー毎に散らばり直さない）。
 * 配置は R2 低食い違い列（加法的準乱数）。連番を hash2 に通すと出力が単調に動いて
 * 星が縦帯に固まってしまうため、ここではハッシュを使わず均一に散らす。
 */
const R2_A = 0.7548776662466927 // 1/φ₂
const R2_B = 0.5698402909980532 // 1/φ₂²
const STARS = Array.from({ length: 26 }, (_, i) => {
  const a = ((i + 1) * R2_A) % 1
  const b = ((i + 1) * R2_B) % 1
  return {
    left: `${(a * 100).toFixed(1)}%`,
    top: `${(b * 100).toFixed(1)}%`,
    size: i % 5 === 0 ? 3 : 2,
    duration: `${(2.5 + b * 3).toFixed(2)}s`,
    delay: `-${(a * 4).toFixed(2)}s`,
  }
})

export default function TreasureBoxView() {
  const items = useCodexStore((s) => s.items)
  const load = useCodexStore((s) => s.load)
  const updatePlacement = useCodexStore((s) => s.updatePlacement)
  const remove = useCodexStore((s) => s.remove)

  const characterId = useAppStore((s) => s.characterId)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; startX: number; startY: number } | null>(null)
  const movedRef = useRef(false)
  const placingRef = useRef(false)
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [selected, setSelected] = useState<Item | null>(null)
  const [deleting, setDeleting] = useState(false)
  // 入室の演出（宝箱を開ける一枚絵）。絵が未配置なら中で即 onDone が呼ばれる。
  const [opening, setOpening] = useState(true)
  const finishOpening = useCallback(() => setOpening(false), [])

  useEffect(() => {
    void load()
  }, [load])

  // 未配置アイテムを自動配置（＝コレットがしまう）。配置すると items が変わり再実行するが、
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

  // 漂い・奥行きは id から決まるので items が変わらない限り作り直さない。
  const visuals = useMemo(() => {
    const map = new Map<
      string,
      { drift: ReturnType<typeof driftStyleFromId>; depth: ReturnType<typeof depthFromId> }
    >()
    for (const it of items) {
      map.set(it.id, { drift: driftStyleFromId(it.id), depth: depthFromId(it.id) })
    }
    return map
  }, [items])

  const normFromPointer = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 }
    return {
      // 上端はヘッダー（← ホーム／タイトル）の裏に潜り込ませない、下端は右下コレットに被せない。
      x: clamp((clientX - rect.left) / rect.width, 0.06, 0.94),
      y: clamp((clientY - rect.top) / rect.height, 0.12, 0.9),
    }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent, item: Item) => {
    dragRef.current = { id: item.id, startX: e.clientX, startY: e.clientY }
    movedRef.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
    // 掴んだ瞬間に漂いを止める（dragPos が立つと drift クラスを外す＝アンカーへスナップ）。
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
        void updatePlacement(item.id, dragPos.x, dragPos.y) // 離した所が新しいアンカー＝また漂い出す
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
    <>
      {/* たからばこの中＝4次元空間。画面いっぱいに敷く（枠も影も無し＝没入感）。 */}
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden"
        style={{
          background:
            'radial-gradient(120% 60% at 50% 4%, rgba(196,181,253,0.42) 0%, rgba(129,140,248,0.16) 40%, rgba(30,27,75,0) 72%),' +
            'radial-gradient(80% 45% at 14% 92%, rgba(110,231,183,0.20) 0%, rgba(30,27,75,0) 68%),' +
            'linear-gradient(160deg, #1e1b4b 0%, #312e81 45%, #4c1d95 100%)',
        }}
      >
        {/* 星屑（奥行きの気配） */}
        <div className="pointer-events-none absolute inset-0">
          {STARS.map((s, i) => (
            <span
              key={i}
              className="absolute animate-twinkle rounded-full bg-white"
              style={{
                left: s.left,
                top: s.top,
                width: s.size,
                height: s.size,
                animationDuration: s.duration,
                animationDelay: s.delay,
              }}
            />
          ))}
        </div>
        {/* 底のやわらかい光（＝底が見えない広さ） */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(196,181,253,0.28)_0%,rgba(30,27,75,0)_70%)]" />

        {items.map((item) => {
          const isDragging = dragPos?.id === item.id
          const pos = isDragging ? dragPos : { x: item.realmX ?? 0.5, y: item.realmY ?? 0.5 }
          const v = visuals.get(item.id)
          const depth = v?.depth ?? { scale: 1, opacity: 1, z: 1 }
          return (
            // 3層：外＝アンカー（ドラッグで動く位置）／中＝漂い（掴むと止まる）／内＝奥行きの拡縮。
            // transform を層で分けているのは、CSS アニメーションの transform が
            // インラインの transform を上書きしてしまい、漂い中に scale が消えるため。
            <div
              key={item.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                zIndex: isDragging ? 20 : depth.z,
              }}
            >
              <button
                type="button"
                onPointerDown={(e) => onPointerDown(e, item)}
                onPointerMove={onPointerMove}
                onPointerUp={() => onPointerUp(item)}
                className={`relative block h-16 w-16 touch-none select-none transition-transform active:scale-110 ${
                  isDragging ? '' : 'animate-drift'
                }`}
                style={isDragging ? undefined : v?.drift}
              >
                {/* 淡い光。`filter: drop-shadow` は使わない＝iOS Safari では
                    漂いアニメで合成レイヤーに載った瞬間、影がアルファ形状ではなく
                    **要素の矩形**に対して描かれ「四角い光」になるため（ドラッグして
                    アニメが外れると直る、という実機の症状で確定・2026-07-21）。
                    背景の放射グラデならレイヤー化の影響を受けず、常に同じ見えになる。 */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(196,181,253,0.30) 0%, rgba(196,181,253,0.09) 34%, rgba(196,181,253,0) 62%)',
                    transform: `scale(${depth.scale * 1.15})`,
                  }}
                />
                <img
                  src={item.iconUrl}
                  alt={item.name}
                  draggable={false}
                  className="relative h-full w-full object-contain"
                  style={{ transform: `scale(${depth.scale})`, opacity: depth.opacity }}
                />
              </button>
            </div>
          )
        })}

        {/* 空状態 */}
        {items.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm font-bold text-lavender">たからばこは、まだ空っぽ</p>
            <p className="text-xs text-indigo-200/80">
              図鑑からアイテムを召喚すると、ここに増えていくよ
            </p>
          </div>
        )}

        {/* 操作ヒント（右下コレットを避けて左寄せ・空間に沈むトーン） */}
        <p className="pointer-events-none absolute inset-x-0 bottom-3 pl-4 pr-36 text-xs text-indigo-200/60">
          アイテムをつかんで動かせるよ・タップで詳細
        </p>
      </div>

      {/* 詳細（名前＋説明＋削除）。全画面レイヤーの上に出す。 */}
      {selected && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/70 px-6"
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

      {/* 入室演出。中の空間より前面に出し、終わると unmount される。 */}
      {opening && <TreasureOpening characterId={characterId} onDone={finishOpening} />}
    </>
  )
}
