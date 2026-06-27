import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useCodexStore } from '../../store/codexStore'
import { imageGenProvider } from '../../lib/ai/imageGen'
import { emotionForConfirm, emotionForGenerated } from '../../lib/character/reaction'
import { RARITY_CLASS, RARITY_GLOW, RARITY_LABEL } from '../../lib/rarity'
import { CATEGORY_LABEL, toCategory } from '../../lib/category'
import GeneratingOverlay from '../../components/GeneratingOverlay'
import type { GeneratedItem } from '../../lib/ai/imageProvider'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import type { Item } from '../../types'

interface KilnViewProps {
  onReaction: (emotion: FairyExpression) => void
}

type KilnPhase = 'select' | 'generating' | 'result'

export default function KilnView({ onReaction }: KilnViewProps) {
  const characterId = useAppStore((s) => s.characterId)
  const items = useCodexStore((s) => s.items)
  const load = useCodexStore((s) => s.load)
  const addFromSynthesis = useCodexStore((s) => s.addFromSynthesis)
  const isNewCategory = useCodexStore((s) => s.isNewCategory)

  const [selected, setSelected] = useState<string[]>([])
  const [phase, setPhase] = useState<KilnPhase>('select')
  const [result, setResult] = useState<GeneratedItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  const selectedItems = selected
    .map((id) => items.find((it) => it.id === id))
    .filter((it): it is Item => !!it)

  const toggleSelect = useCallback(
    (id: string) => {
      if (phase !== 'select') return
      setSelected((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id)
        if (prev.length >= 2) return prev
        return [...prev, id]
      })
    },
    [phase],
  )

  const handleSynthesize = useCallback(async () => {
    if (selected.length !== 2 || phase !== 'select') return
    const [a, b] = selectedItems
    if (!a || !b) return

    setPhase('generating')
    setError(null)
    try {
      const generated = await imageGenProvider.synthesize(
        { imageUrl: a.iconUrl, name: a.name, description: a.description },
        { imageUrl: b.iconUrl, name: b.name, description: b.description },
        { personaId: characterId },
      )
      setResult(generated)
      setPhase('result')
      onReaction(emotionForGenerated(generated))
    } catch (err) {
      setError(err instanceof Error ? err.message : '合成に失敗しました')
      setPhase('select')
    }
  }, [selected, selectedItems, phase, characterId, onReaction])

  const handleConfirm = useCallback(async () => {
    if (!result || saving || selected.length !== 2) return
    setSaving(true)
    setError(null)
    try {
      const isNew = isNewCategory(result.category)
      await addFromSynthesis(result, selected[0], selected[1])
      setResult(null)
      setSelected([])
      setPhase('select')
      onReaction(emotionForConfirm(isNew))
    } catch (err) {
      setError(err instanceof Error ? err.message : '図鑑への登録に失敗しました')
    } finally {
      setSaving(false)
    }
  }, [result, saving, selected, addFromSynthesis, isNewCategory, onReaction])

  const handleRetry = useCallback(() => {
    setResult(null)
    setError(null)
    setPhase('select')
  }, [])

  const handleReroll = useCallback(async () => {
    if (selected.length !== 2) return
    const [a, b] = selectedItems
    if (!a || !b) return

    setPhase('generating')
    setError(null)
    try {
      const generated = await imageGenProvider.synthesize(
        { imageUrl: a.iconUrl, name: a.name, description: a.description },
        { imageUrl: b.iconUrl, name: b.name, description: b.description },
        { personaId: characterId },
      )
      setResult(generated)
      setPhase('result')
      onReaction(emotionForGenerated(generated))
    } catch (err) {
      setError(err instanceof Error ? err.message : '合成に失敗しました')
      setPhase('result')
    }
  }, [selected, selectedItems, characterId, onReaction])

  if (items.length < 2) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm text-slate-500">合成にはアイテムが2つ以上必要だよ</p>
        <p className="text-xs text-slate-400">カメラで集めてきてね</p>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-3">
      {/* 選択中の素材プレビュー */}
      <div className="flex items-center justify-center gap-3">
        <SlotPreview item={selectedItems[0]} label="素材A" />
        <span className="text-xl font-bold text-violet-400">+</span>
        <SlotPreview item={selectedItems[1]} label="素材B" />
      </div>

      {/* 合成ボタン */}
      {phase === 'select' && (
        <button
          type="button"
          onClick={() => void handleSynthesize()}
          disabled={selected.length !== 2}
          className="mx-auto rounded-full bg-lavender px-8 py-2.5 font-bold text-white shadow-pop transition active:scale-95 disabled:opacity-40"
        >
          合成する
        </button>
      )}

      {error && (
        <p className="text-center text-xs text-peach">{error}</p>
      )}

      {/* アイテム選択グリッド */}
      {phase === 'select' && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((item) => {
            const isSelected = selected.includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleSelect(item.id)}
                className={`flex flex-col items-center rounded-2xl p-1.5 text-center transition active:scale-95 ${
                  isSelected
                    ? 'bg-lavender/20 ring-2 ring-lavender'
                    : 'bg-white shadow-pop'
                }`}
              >
                <img
                  src={item.iconUrl}
                  alt={item.name}
                  className="aspect-square w-full rounded-xl object-contain"
                />
                <span className="mt-1 line-clamp-1 text-xs font-bold text-slate-700">
                  {item.name}
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

      {/* 結果プレビュー */}
      {phase === 'result' && result && (
        <div className="flex flex-col items-center gap-3">
          <div className="animate-reveal w-full max-w-xs rounded-3xl bg-white p-4 text-slate-800 shadow-pop">
            <div className="relative mx-auto aspect-square w-full max-w-[15rem]">
              {result.rarity && RARITY_GLOW[result.rarity] && (
                <span
                  className={`absolute inset-2 rounded-full blur-2xl animate-pulse ${RARITY_GLOW[result.rarity]}`}
                  aria-hidden
                />
              )}
              <img
                src={result.imageUrl}
                alt={result.name}
                className="relative h-full w-full rounded-2xl object-contain"
              />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <h2 className="font-display text-xl font-bold">{result.name}</h2>
              {result.rarity && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${RARITY_CLASS[result.rarity]}`}
                >
                  {RARITY_LABEL[result.rarity]}
                </span>
              )}
            </div>
            {result.category && (
              <p className="mt-0.5 text-center text-xs text-slate-400">
                {CATEGORY_LABEL[toCategory(result.category)]}
              </p>
            )}
            <p className="mt-2 whitespace-pre-wrap text-center text-sm text-slate-600">
              {result.description}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving}
            className="rounded-full bg-mint px-8 py-2.5 font-bold text-slate-900 shadow-pop transition active:scale-95 disabled:opacity-50"
          >
            {saving ? '登録中…' : '図鑑にしまう'}
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleReroll()}
              disabled={saving}
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-bold text-slate-500 transition active:scale-95 disabled:opacity-50"
            >
              もう一回合成
            </button>
            <button
              type="button"
              onClick={handleRetry}
              disabled={saving}
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-bold text-slate-500 transition active:scale-95 disabled:opacity-50"
            >
              素材を変える
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SlotPreview({ item, label }: { item?: Item; label: string }) {
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/60 shadow-pop">
      {item ? (
        <img
          src={item.iconUrl}
          alt={item.name}
          className="h-full w-full rounded-2xl object-contain p-1"
        />
      ) : (
        <span className="text-xs text-slate-400">{label}</span>
      )}
    </div>
  )
}
