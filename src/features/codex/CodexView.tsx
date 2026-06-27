import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useCodexStore } from '../../store/codexStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import { RARITY_CLASS, RARITY_LABEL } from '../../lib/rarity'
import { CATEGORY_EMOJI, CATEGORY_LABEL, CATEGORY_ORDER, toCategory } from '../../lib/category'
import type { Item, ItemCategory } from '../../types'

/**
 * 図鑑（ホームの収集アイテム一覧／STEP4a）。
 * 集めたアイテムをグリッド表示し、タップで詳細・削除。永続層は codexStore 越し。
 * 検索/並び替え/絞り込みは後続（v1）。
 */

/** ISO 8601 を「2026/6/19」形式に。 */
function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ja-JP')
}

function RarityBadge({ item }: { item: Item }) {
  if (!item.rarity) return null
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${RARITY_CLASS[item.rarity]}`}>
      {RARITY_LABEL[item.rarity]}
    </span>
  )
}

/** 並び替え/絞り込みのチップ（横スクロールで縮まないよう shrink-0）。 */
function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold transition active:scale-95 ${
        active ? 'bg-violet-500 text-white shadow-pop' : 'bg-white text-slate-500'
      }`}
    >
      {label}
    </button>
  )
}

export default function CodexView() {
  const characterId = useAppStore((s) => s.characterId)
  const items = useCodexStore((s) => s.items)
  const status = useCodexStore((s) => s.status)
  const error = useCodexStore((s) => s.error)
  const load = useCodexStore((s) => s.load)
  const remove = useCodexStore((s) => s.remove)

  const [selected, setSelected] = useState<Item | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [filter, setFilter] = useState<ItemCategory | 'all'>('all')
  const [sortMode, setSortMode] = useState<'recent' | 'category'>('recent')

  // マウント時に図鑑を読み込む（ローカルなので軽い）。
  useEffect(() => {
    void load()
  }, [load])

  // チップに出すのは「実際に1件以上あるカテゴリ」だけ（CATEGORY_ORDER 順）。
  const availableCategories = useMemo(() => {
    const present = new Set(items.map((it) => toCategory(it.category)))
    return CATEGORY_ORDER.filter((c) => present.has(c))
  }, [items])

  // 絞り込み中のカテゴリが（削除などで）消えたら実質「すべて」に倒す（state は次操作で更新）。
  const effectiveFilter: ItemCategory | 'all' =
    filter === 'all' || availableCategories.includes(filter) ? filter : 'all'

  // 正規化 → 絞り込み → 並び替え。カテゴリ順は安定ソートで各カテゴリ内の新しい順を保つ。
  const visibleItems = useMemo(() => {
    const filtered =
      effectiveFilter === 'all'
        ? items
        : items.filter((it) => toCategory(it.category) === effectiveFilter)
    if (sortMode === 'recent') return filtered
    return [...filtered].sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(toCategory(a.category)) -
        CATEGORY_ORDER.indexOf(toCategory(b.category)),
    )
  }, [items, effectiveFilter, sortMode])

  const closeDetail = () => {
    setSelected(null)
    setConfirmDelete(false)
  }

  const handleDelete = async () => {
    if (!selected || deleting) return
    setDeleting(true)
    try {
      await remove(selected.id)
      closeDetail()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 py-6">
      <h1 className="mb-4 text-center font-display text-2xl font-bold text-violet-700">図鑑</h1>

      {/* 読み込み中 */}
      {status === 'loading' && items.length === 0 && (
        <p className="mt-10 animate-pulse text-center text-sm text-slate-400">読み込み中…</p>
      )}

      {/* エラー */}
      {status === 'error' && (
        <p className="mt-10 text-center text-sm text-peach">{error}</p>
      )}

      {/* 空状態：妖精＋誘導 */}
      {status !== 'loading' && status !== 'error' && items.length === 0 && (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <Sprite2DRenderer characterId={characterId} expression="neutral" size="lg" />
          <p className="text-sm text-slate-500">まだ何も集めてないみたい。</p>
          <p className="text-sm text-slate-500">カメラで撮ってみよう！</p>
        </div>
      )}

      {/* 並び替え＋絞り込み（カテゴリは裏方データ。カードには出さず整理にだけ使う） */}
      {items.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex justify-center gap-1.5">
            {(['recent', 'category'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition active:scale-95 ${
                  sortMode === mode ? 'bg-violet-500 text-white shadow-pop' : 'bg-white text-slate-500'
                }`}
              >
                {mode === 'recent' ? '新しい順' : 'カテゴリ順'}
              </button>
            ))}
          </div>
          {availableCategories.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <FilterChip
                active={effectiveFilter === 'all'}
                onClick={() => setFilter('all')}
                label="すべて"
              />
              {availableCategories.map((cat) => (
                <FilterChip
                  key={cat}
                  active={effectiveFilter === cat}
                  onClick={() => setFilter(cat)}
                  label={`${CATEGORY_EMOJI[cat]} ${CATEGORY_LABEL[cat]}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* グリッド */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className="flex flex-col items-center rounded-2xl bg-white p-2 text-center shadow-pop transition active:scale-95"
            >
              <img
                src={item.iconUrl}
                alt={item.name}
                className="aspect-square w-full rounded-xl object-contain"
              />
              <span className="mt-1.5 line-clamp-1 text-sm font-bold text-slate-700">
                {item.name}
              </span>
              <RarityBadge item={item} />
            </button>
          ))}
        </div>
      )}

      {/* 詳細モーダル */}
      {selected && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/60 px-6"
          onClick={closeDetail}
        >
          <div
            className="w-full max-w-xs rounded-3xl bg-white p-4 text-slate-800 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selected.iconUrl}
              alt={selected.name}
              className="mx-auto aspect-square w-full max-w-[14rem] rounded-2xl object-contain"
            />
            <div className="mt-3 flex items-center justify-center gap-2">
              <h2 className="font-display text-xl font-bold">{selected.name}</h2>
              <RarityBadge item={selected} />
            </div>
            <p className="mt-0.5 text-center text-xs text-slate-400">
              {CATEGORY_EMOJI[toCategory(selected.category)]} {CATEGORY_LABEL[toCategory(selected.category)]}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-center text-sm text-slate-600">
              {selected.description}
            </p>
            <p className="mt-2 text-center text-xs text-slate-400">
              {formatDate(selected.createdAt)} に出会った
            </p>

            <div className="mt-4 flex items-center justify-center gap-3">
              {!confirmDelete ? (
                <>
                  <button
                    type="button"
                    onClick={closeDetail}
                    className="rounded-full bg-mint px-6 py-2 font-bold text-slate-900 shadow-pop transition active:scale-95"
                  >
                    閉じる
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-400 transition active:scale-95"
                  >
                    削除
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="rounded-full bg-peach px-5 py-2 font-bold text-white shadow-pop transition active:scale-95 disabled:opacity-50"
                  >
                    {deleting ? '削除中…' : '本当に削除'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-500 transition active:scale-95"
                  >
                    やめる
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
