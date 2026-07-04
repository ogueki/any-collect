import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useCollectionStore } from '../../store/collectionStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import { CATEGORY_EMOJI, CATEGORY_LABEL, CATEGORY_ORDER } from '../../lib/category'
import { RARITY_CLASS, RARITY_GLOW, RARITY_LABEL } from '../../lib/rarity'
import type { CollectionEntry, ItemCategory } from '../../types'

/**
 * 図鑑（Seek 型・v2）。カメラで判定・クロップした「実物」を種別に集めて見返す。
 * 同種は 1 マスにまとまり、発見回数が積まれる（albumStore の写真一覧に対して、
 * こちらは種別デデュープ済みのコレクション）。永続層は collectionStore 越し。
 * 画像は Blob なので object URL を作って表示・解放する。
 * 並び替え（カテゴリ順/新しい順）＋カテゴリ絞り込みは旧 CodexView のパターンを踏襲。
 */

/** ISO 8601 を「2026/7/2」形式に。 */
function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ja-JP')
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

export default function CollectionView() {
  const characterId = useAppStore((s) => s.characterId)
  const entries = useCollectionStore((s) => s.entries)
  const status = useCollectionStore((s) => s.status)
  const error = useCollectionStore((s) => s.error)
  const load = useCollectionStore((s) => s.load)
  const remove = useCollectionStore((s) => s.remove)

  const [selected, setSelected] = useState<CollectionEntry | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [filter, setFilter] = useState<ItemCategory | 'all'>('all')
  const [sortMode, setSortMode] = useState<'category' | 'recent'>('category')

  // マウント時に図鑑を読み込む（ローカルなので軽い）。
  useEffect(() => {
    void load()
  }, [load])

  // チップに出すのは「実際に1件以上あるカテゴリ」だけ（CATEGORY_ORDER 順）。
  const availableCategories = useMemo(() => {
    const present = new Set(entries.map((e) => e.category))
    return CATEGORY_ORDER.filter((c) => present.has(c))
  }, [entries])

  // 絞り込み中のカテゴリが（削除などで）消えたら実質「すべて」に倒す。
  const effectiveFilter: ItemCategory | 'all' =
    filter === 'all' || availableCategories.includes(filter) ? filter : 'all'

  // 絞り込み → 並び替え。カテゴリ順は CATEGORY_ORDER→初発見の昇順（安定）、新しい順は初発見の降順。
  const visibleEntries = useMemo(() => {
    const filtered =
      effectiveFilter === 'all' ? entries : entries.filter((e) => e.category === effectiveFilter)
    return [...filtered].sort((a, b) => {
      if (sortMode === 'recent') return b.firstSeenAt.localeCompare(a.firstSeenAt)
      const ca = CATEGORY_ORDER.indexOf(a.category)
      const cb = CATEGORY_ORDER.indexOf(b.category)
      if (ca !== cb) return ca - cb
      return a.firstSeenAt.localeCompare(b.firstSeenAt)
    })
  }, [entries, effectiveFilter, sortMode])

  // Blob → object URL（エントリごと）。entries が変わるたび作り直し、前回分は cleanup で解放する。
  const urls = useMemo(() => {
    const map = new Map<string, string>()
    entries.forEach((e) => map.set(e.id, URL.createObjectURL(e.blob)))
    return map
  }, [entries])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  // 選択中エントリは entries の最新を映す（削除・再発見で count が変わっても追従）。
  const selectedLive = selected ? entries.find((e) => e.id === selected.id) ?? null : null

  const closeDetail = () => {
    setSelected(null)
    setConfirmDelete(false)
  }

  const handleDelete = async () => {
    if (!selectedLive || deleting) return
    setDeleting(true)
    try {
      await remove(selectedLive.id)
      closeDetail()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col">
      {/* 読み込み中 */}
      {status === 'loading' && entries.length === 0 && (
        <p className="mt-10 animate-pulse text-center text-sm text-slate-400">読み込み中…</p>
      )}

      {/* エラー */}
      {status === 'error' && <p className="mt-10 text-center text-sm text-peach">{error}</p>}

      {/* 空状態：妖精＋誘導 */}
      {status !== 'loading' && status !== 'error' && entries.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <Sprite2DRenderer characterId={characterId} expression="neutral" size="lg" />
          <p className="text-sm text-slate-500">まだ図鑑がからっぽだよ。</p>
          <p className="text-sm text-slate-500">カメラでいろんなものを見つけてこよう！</p>
        </div>
      )}

      {/* 並び替え＋カテゴリ絞り込み */}
      {entries.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex justify-center gap-1.5">
            {(['category', 'recent'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition active:scale-95 ${
                  sortMode === mode ? 'bg-violet-500 text-white shadow-pop' : 'bg-white text-slate-500'
                }`}
              >
                {mode === 'category' ? 'カテゴリ順' : '新しい順'}
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
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {visibleEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelected(entry)}
              className="relative flex flex-col items-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-pop transition active:scale-95"
            >
              <div className="relative w-full">
                {entry.rarity && RARITY_GLOW[entry.rarity] && (
                  <span
                    className={`absolute inset-3 rounded-full blur-xl ${RARITY_GLOW[entry.rarity]}`}
                    aria-hidden
                  />
                )}
                <img
                  src={urls.get(entry.id)}
                  alt={entry.name}
                  className="relative aspect-square w-full rounded-xl object-cover"
                />
                {entry.count > 1 && (
                  <span className="absolute right-1 top-1 rounded-full bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    ×{entry.count}
                  </span>
                )}
              </div>
              <span className="mt-1 line-clamp-1 w-full text-center text-xs font-bold text-slate-700">
                {entry.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 詳細モーダル */}
      {selectedLive && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/60 px-6"
          onClick={closeDetail}
        >
          <div
            className="w-full max-w-xs rounded-3xl bg-white p-4 text-slate-800 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative mx-auto aspect-square w-full max-w-[15rem]">
              {selectedLive.rarity && RARITY_GLOW[selectedLive.rarity] && (
                <span
                  className={`absolute inset-2 rounded-full blur-2xl ${RARITY_GLOW[selectedLive.rarity]}`}
                  aria-hidden
                />
              )}
              <img
                src={urls.get(selectedLive.id)}
                alt={selectedLive.name}
                className="relative h-full w-full rounded-2xl object-cover"
              />
            </div>

            <div className="mt-3 flex items-center justify-center gap-2">
              <h2 className="font-display text-xl font-bold">{selectedLive.name}</h2>
              {selectedLive.rarity && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${RARITY_CLASS[selectedLive.rarity]}`}
                >
                  {RARITY_LABEL[selectedLive.rarity]}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-center text-xs text-slate-400">
              {CATEGORY_EMOJI[selectedLive.category]} {CATEGORY_LABEL[selectedLive.category]}
              <span className="ml-2">見つけた回数 {selectedLive.count}</span>
            </p>

            {selectedLive.description && (
              <div className="mt-3 rounded-2xl bg-lavender/10 px-3 py-2 text-sm text-slate-600">
                <span className="mr-1 text-xs font-bold text-lavender">コレット</span>
                {selectedLive.description}
              </div>
            )}
            <p className="mt-2 text-center text-xs text-slate-400">
              {formatDate(selectedLive.firstSeenAt)} にはじめて見つけた
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
