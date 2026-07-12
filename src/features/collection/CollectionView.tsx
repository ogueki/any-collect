import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useCollectionStore } from '../../store/collectionStore'
import { useCodexStore } from '../../store/codexStore'
import { useGaugeStore, GAUGE_MAX } from '../../store/gaugeStore'
import { useAffinityStore, AFFINITY_PER_ITEM } from '../../store/affinityStore'
import { imageGenProvider } from '../../lib/ai/imageGen'
import { emotionForGenerated } from '../../lib/character/reaction'
import GeneratingOverlay from '../../components/GeneratingOverlay'
import { useShellFairy } from '../../components/shellFairy'
import { SparkleIcon } from '../../components/icons'
import { CATEGORY_EMOJI, CATEGORY_LABEL, CATEGORY_ORDER } from '../../lib/category'
import type { GeneratedItem } from '../../lib/ai/imageProvider'
import type { CollectionEntry, ItemCategory } from '../../types'

/**
 * 図鑑（Seek 型・v2）。カメラで判定・クロップした「実物」を種別に集めて見返す。
 * 同種は 1 マスにまとまり、発見回数が積まれる（albumStore の写真一覧に対して、
 * こちらは種別デデュープ済みのコレクション）。永続層は collectionStore 越し。
 * 画像は Blob なので object URL を作って表示・解放する。
 * 並び替え（カテゴリ順/新しい順）＋カテゴリ絞り込みは旧 CodexView のパターンを踏襲。
 *
 * 新IA（レイアウト再構成 ②）：図鑑は「召喚魔法」の起点でもある。まほうパワーが満タンの
 * ときだけ、図鑑エントリ1つ → 透過アイテムを Gemini で生成し妖精界に出現させる
 * （旧 KilnView の単体化ロジックをここへ移設）。生成は成功時だけまほうパワーを消費・図鑑は消費しない。
 */

/** ISO 8601 を「2026/7/2」形式に。 */
function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ja-JP')
}

/** 召喚結果プレビューの背景＝妖精界を思わせるやわらかいパステル地（透過アイテムが映える）。 */
const PREVIEW_BG_STYLE: React.CSSProperties = {
  background: 'linear-gradient(to bottom, #dbeafe 0%, #ede9fe 45%, #d1fae5 100%)',
}

/** 召喚のフェーズ（idle＝閲覧中／生成中／結果プレビュー）。 */
type SummonPhase = 'idle' | 'generating' | 'result'

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
  const go = useAppStore((s) => s.go)
  const entries = useCollectionStore((s) => s.entries)
  const status = useCollectionStore((s) => s.status)
  const error = useCollectionStore((s) => s.error)
  const load = useCollectionStore((s) => s.load)
  const remove = useCollectionStore((s) => s.remove)

  // 召喚（図鑑エントリ→透過アイテム化）に必要なストア。
  const addFromGenerated = useCodexStore((s) => s.addFromGenerated)
  const gaugeValue = useGaugeStore((s) => s.value)
  const spendGauge = useGaugeStore((s) => s.spend)
  const addAffinity = useAffinityStore((s) => s.add)
  const { fire } = useShellFairy() // 召喚成功→右下コレットが反応

  const [selected, setSelected] = useState<CollectionEntry | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [filter, setFilter] = useState<ItemCategory | 'all'>('all')
  const [sortMode, setSortMode] = useState<'category' | 'recent'>('category')

  // 召喚の状態。
  const [summonPhase, setSummonPhase] = useState<SummonPhase>('idle')
  const [summonResult, setSummonResult] = useState<GeneratedItem | null>(null)
  const [summonError, setSummonError] = useState<string | null>(null)

  const gaugeFull = gaugeValue >= GAUGE_MAX

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

  // 召喚：図鑑エントリ1つ → 透過アイテムを生成し妖精界に出現させる。
  // 成功時だけまほうパワーを消費（失敗なら満タンのまま再挑戦できる）。図鑑エントリは消費しない。
  const handleSummon = useCallback(
    async (entry: CollectionEntry) => {
      if (summonPhase !== 'idle' || !gaugeFull) return
      closeDetail()
      setSummonPhase('generating')
      setSummonError(null)
      try {
        const generated = await imageGenProvider.generateItem(entry.blob, { personaId: characterId })
        spendGauge()
        await addFromGenerated(generated, entry.id)
        // 召喚は特別な体験＝絆も大きめに増やす。
        addAffinity(AFFINITY_PER_ITEM)
        setSummonResult(generated)
        setSummonPhase('result')
        fire(emotionForGenerated()) // 右下コレットが大喜び
      } catch (err) {
        setSummonError(err instanceof Error ? err.message : '召喚に失敗しました')
        setSummonPhase('idle')
      }
    },
    [summonPhase, gaugeFull, characterId, spendGauge, addFromGenerated, addAffinity, fire],
  )

  const closeSummonResult = () => {
    setSummonResult(null)
    setSummonPhase('idle')
  }

  return (
    <div className="flex w-full max-w-md flex-col">
      {/* 読み込み中 */}
      {status === 'loading' && entries.length === 0 && (
        <p className="mt-10 animate-pulse text-center text-sm text-slate-400">読み込み中…</p>
      )}

      {/* エラー */}
      {status === 'error' && <p className="mt-10 text-center text-sm text-peach">{error}</p>}

      {/* 空状態：誘導（コレットは右下の共通シェルにいる） */}
      {status !== 'loading' && status !== 'error' && entries.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-bold text-slate-500">まだ図鑑がからっぽだよ。</p>
          <p className="text-sm text-slate-400">カメラでいろんなものを見つけてこよう！</p>
        </div>
      )}

      {/* 召喚できるよバナー（まほうパワーが満タンのときだけ） */}
      {entries.length > 0 && gaugeFull && summonPhase === 'idle' && (
        <div className="mb-3 rounded-2xl bg-mint/20 px-3 py-2 text-center ring-1 ring-mint">
          <p className="text-xs font-bold text-emerald-700">
            まほうパワーが満タン！ 図鑑の子を1つえらんで召喚しよう
          </p>
        </div>
      )}

      {/* 召喚エラー（生成失敗） */}
      {summonError && summonPhase === 'idle' && (
        <p className="mb-3 text-center text-xs text-peach">{summonError}</p>
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

      {/* グリッド。まほうパワーが満タンのマスは召喚できるヒントとして淡く光らせる。 */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {visibleEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelected(entry)}
              className={`relative flex flex-col items-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-pop transition active:scale-95 ${
                gaugeFull ? 'ring-2 ring-mint/60' : ''
              }`}
            >
              <div className="relative w-full">
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
              <img
                src={urls.get(selectedLive.id)}
                alt={selectedLive.name}
                className="relative h-full w-full rounded-2xl object-cover"
              />
            </div>

            <div className="mt-3 flex items-center justify-center gap-2">
              <h2 className="font-display text-xl font-bold">{selectedLive.name}</h2>
            </div>
            <p className="mt-0.5 text-center text-xs text-slate-400">
              {CATEGORY_EMOJI[selectedLive.category]} {CATEGORY_LABEL[selectedLive.category]}
              <span className="ml-2">見つけた回数 {selectedLive.count}</span>
            </p>

            {selectedLive.description && (
              <div className="mt-3 rounded-2xl bg-lavender/10 px-3 py-2 text-left text-sm text-slate-600">
                {selectedLive.description}
              </div>
            )}
            <p className="mt-2 text-center text-xs text-slate-400">
              {formatDate(selectedLive.firstSeenAt)} にはじめて見つけた
            </p>

            {/* 召喚（まほうパワーが満タンのときだけ／削除確認中は隠す） */}
            {!confirmDelete &&
              (gaugeFull ? (
                <button
                  type="button"
                  onClick={() => void handleSummon(selectedLive)}
                  className="mt-4 w-full rounded-full bg-lavender py-2.5 font-bold text-white shadow-pop transition active:scale-95"
                >
                  この子を召喚する
                </button>
              ) : (
                <p className="mt-4 text-center text-xs text-slate-400">
                  まほうパワーがたまると、この子を召喚できるよ
                </p>
              ))}

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

      {/* 召喚：生成中オーバーレイ */}
      {summonPhase === 'generating' && (
        <div className="fixed inset-0 z-20">
          <GeneratingOverlay characterId={characterId} context="synthesizing" />
        </div>
      )}

      {/* 召喚：結果プレビュー（透過アイテム・パステル地で透過を確認） */}
      {summonPhase === 'result' && summonResult && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/60 px-6">
          <div className="animate-reveal w-full max-w-xs rounded-3xl bg-white p-4 text-slate-800 shadow-pop">
            <div
              className="relative mx-auto aspect-square w-full max-w-[15rem] overflow-hidden rounded-2xl"
              style={PREVIEW_BG_STYLE}
            >
              <img
                src={summonResult.imageUrl}
                alt={summonResult.name}
                className="relative h-full w-full object-contain"
              />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <h2 className="font-display text-xl font-bold">{summonResult.name}</h2>
            </div>
            {summonResult.category && (
              <p className="mt-0.5 text-center text-xs text-slate-400">
                {CATEGORY_LABEL[summonResult.category]}
              </p>
            )}
            <p className="mt-2 whitespace-pre-wrap text-center text-sm text-slate-600">
              {summonResult.description}
            </p>
            <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-mint">
              <SparkleIcon className="h-3.5 w-3.5" />
              妖精界にあらわれたよ
            </p>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  closeSummonResult()
                  go('realm')
                }}
                className="rounded-full bg-mint px-6 py-2.5 font-bold text-slate-900 shadow-pop transition active:scale-95"
              >
                妖精界で見る
              </button>
              <button
                type="button"
                onClick={closeSummonResult}
                className="rounded-full border border-slate-300 px-5 py-2 text-sm font-bold text-slate-500 transition active:scale-95"
              >
                とじる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
