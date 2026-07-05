import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useCollectionStore } from '../../store/collectionStore'
import { useCodexStore } from '../../store/codexStore'
import { useGaugeStore, GAUGE_MAX } from '../../store/gaugeStore'
import { useAffinityStore, AFFINITY_PER_ITEM } from '../../store/affinityStore'
import { imageGenProvider } from '../../lib/ai/imageGen'
import { emotionForGenerated } from '../../lib/character/reaction'
import { CATEGORY_LABEL, toCategory } from '../../lib/category'
import GeneratingOverlay from '../../components/GeneratingOverlay'
import type { GeneratedItem } from '../../lib/ai/imageProvider'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'

/**
 * 妖精の窯（v2・STEP1e）。**図鑑エントリ1つ → 透過アイテム化**する橋。
 * 図鑑（実物クロップ）を入力に Gemini で透過アイコンを生成し、妖精界に出現させる。
 * 高価なアイテム化は「コレットの元気」ゲージが満タンのときだけ解禁（満タン→生成成功でリセット）。
 * 図鑑エントリは消費しない（何度でも素になれる）。旧2素材合成は導線から外して残置。
 */

interface KilnViewProps {
  onReaction: (emotion: FairyExpression) => void
  /** 生成後に妖精界へ飛ぶ（1f で HomeMode が渡す。未指定なら「とじる」のみ） */
  onGoRealm?: () => void
}

type KilnPhase = 'select' | 'generating' | 'result'

/** 結果プレビューの背景＝妖精界を思わせるやわらかいパステル地（透過アイテムが映える）。 */
const PREVIEW_BG_STYLE: React.CSSProperties = {
  background: 'linear-gradient(to bottom, #dbeafe 0%, #ede9fe 45%, #d1fae5 100%)',
}

export default function KilnView({ onReaction, onGoRealm }: KilnViewProps) {
  const characterId = useAppStore((s) => s.characterId)
  const entries = useCollectionStore((s) => s.entries)
  const loadEntries = useCollectionStore((s) => s.load)
  const addFromGenerated = useCodexStore((s) => s.addFromGenerated)
  const gaugeValue = useGaugeStore((s) => s.value)
  const spendGauge = useGaugeStore((s) => s.spend)
  const addAffinity = useAffinityStore((s) => s.add)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [phase, setPhase] = useState<KilnPhase>('select')
  const [result, setResult] = useState<GeneratedItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isFull = gaugeValue >= GAUGE_MAX
  const gaugePct = Math.min(100, Math.round((gaugeValue / GAUGE_MAX) * 100))

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  // Blob → object URL（エントリごと）。entries が変わるたび作り直し、前回分は cleanup で解放。
  const urls = useMemo(() => {
    const map = new Map<string, string>()
    entries.forEach((e) => map.set(e.id, URL.createObjectURL(e.blob)))
    return map
  }, [entries])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  const selectedEntry = entries.find((e) => e.id === selectedId) ?? null

  const handleGenerate = useCallback(async () => {
    if (phase !== 'select' || !selectedEntry || !isFull) return
    setPhase('generating')
    setError(null)
    try {
      const generated = await imageGenProvider.generateItem(selectedEntry.blob, {
        personaId: characterId,
      })
      // 成功時のみゲージ消費＋保存（失敗ならゲージは満タンのまま＝再挑戦できる）。
      spendGauge()
      await addFromGenerated(generated, selectedEntry.id)
      // アイテム化は特別な体験＝絆も大きめに増やす。
      addAffinity(AFFINITY_PER_ITEM)
      setResult(generated)
      setPhase('result')
      onReaction(emotionForGenerated())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アイテム化に失敗しました')
      setPhase('select')
    }
  }, [phase, selectedEntry, isFull, characterId, spendGauge, addFromGenerated, addAffinity, onReaction])

  const handleClose = useCallback(() => {
    setResult(null)
    setError(null)
    setSelectedId(null)
    setPhase('select')
  }, [])

  // 図鑑が空：カメラへ誘導。
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm text-slate-500">まだ図鑑がからっぽだよ</p>
        <p className="text-xs text-slate-400">カメラでいろんなものを見つけてこよう！</p>
      </div>
    )
  }

  return (
    <div className="relative flex w-full max-w-md flex-col gap-3">
      {/* ゲージ状況＋アイテム化ボタン（select フェーズ） */}
      {phase === 'select' && (
        <div className="flex flex-col items-center gap-2">
          <div className="w-full max-w-xs">
            <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-500">
              <span>コレットの元気</span>
              <span>{gaugePct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all ${isFull ? 'bg-mint' : 'bg-lavender'}`}
                style={{ width: `${gaugePct}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!selectedEntry || !isFull}
            className="mx-auto rounded-full bg-lavender px-8 py-2.5 font-bold text-white shadow-pop transition active:scale-95 disabled:opacity-40"
          >
            アイテムにする
          </button>
          <p className="text-center text-xs text-slate-400">
            {!isFull
              ? 'コレットの元気がたまったら、図鑑のものをアイテムにできるよ'
              : !selectedEntry
                ? '図鑑から1つえらんでね'
                : `「${selectedEntry.name}」をアイテムにする？`}
          </p>
        </div>
      )}

      {error && <p className="text-center text-xs text-peach">{error}</p>}

      {/* 図鑑エントリの選択グリッド */}
      {phase === 'select' && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {entries.map((entry) => {
            const isSelected = entry.id === selectedId
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedId(isSelected ? null : entry.id)}
                className={`flex flex-col items-center rounded-2xl p-1.5 text-center transition active:scale-95 ${
                  isSelected ? 'bg-lavender/20 ring-2 ring-lavender' : 'bg-white shadow-pop'
                }`}
              >
                <img
                  src={urls.get(entry.id)}
                  alt={entry.name}
                  className="aspect-square w-full rounded-xl object-cover"
                />
                <span className="mt-1 line-clamp-1 text-xs font-bold text-slate-700">
                  {entry.name}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* 生成中オーバーレイ */}
      {phase === 'generating' && (
        <div className="fixed inset-0 z-20">
          <GeneratingOverlay characterId={characterId} context="synthesizing" />
        </div>
      )}

      {/* 結果プレビュー（透過アイテム・チェッカー地で透過を確認） */}
      {phase === 'result' && result && (
        <div className="flex flex-col items-center gap-3">
          <div className="animate-reveal w-full max-w-xs rounded-3xl bg-white p-4 text-slate-800 shadow-pop">
            <div
              className="relative mx-auto aspect-square w-full max-w-[15rem] overflow-hidden rounded-2xl"
              style={PREVIEW_BG_STYLE}
            >
              <img
                src={result.imageUrl}
                alt={result.name}
                className="relative h-full w-full object-contain"
              />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <h2 className="font-display text-xl font-bold">{result.name}</h2>
            </div>
            {result.category && (
              <p className="mt-0.5 text-center text-xs text-slate-400">
                {CATEGORY_LABEL[toCategory(result.category)]}
              </p>
            )}
            <p className="mt-2 whitespace-pre-wrap text-center text-sm text-slate-600">
              {result.description}
            </p>
            <p className="mt-2 text-center text-xs text-mint">✨ 妖精界にあらわれたよ</p>
          </div>

          <div className="flex items-center gap-3">
            {onGoRealm && (
              <button
                type="button"
                onClick={() => {
                  handleClose()
                  onGoRealm()
                }}
                className="rounded-full bg-mint px-6 py-2.5 font-bold text-slate-900 shadow-pop transition active:scale-95"
              >
                妖精界で見る
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-bold text-slate-500 transition active:scale-95"
            >
              とじる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
