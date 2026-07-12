import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useCodexStore } from '../../store/codexStore'
import { useAffinityStore, AFFINITY_PER_ITEM } from '../../store/affinityStore'
import { imageGenProvider } from '../../lib/ai/imageGen'
import { emotionForConfirm, emotionForGenerated } from '../../lib/character/reaction'
import { CATEGORY_LABEL, toCategory } from '../../lib/category'
import GeneratingOverlay from '../../components/GeneratingOverlay'
import { useShellFairy } from '../../components/shellFairy'
import { SparkleIcon } from '../../components/icons'
import type { GeneratedItem } from '../../lib/ai/imageProvider'
import type { Item } from '../../types'

/**
 * 妖精の窯（新IA・レイアウト再構成 ③）＝**2つのアイテムを混ぜて合成**する場所（メニュー内）。
 * 図鑑エントリ→透過アイテム化（召喚魔法）は図鑑（CollectionView）へ移したので、
 * 窯は名実一致で「合成」に戻す（残置していた synthesize 系を復活）。
 * 素材は消費しない（何度でも合成の素になれる）。合成結果は妖精界のアイテムになる。
 */

interface KilnViewProps {
  /** 合成後に妖精界へ飛ぶ（App が渡す。未指定なら「つづける」のみ） */
  onGoRealm?: () => void
}

type KilnPhase = 'select' | 'generating' | 'result' | 'saved'

/** 結果プレビューの背景＝妖精界を思わせるやわらかいパステル地（透過アイテムが映える・召喚と共通）。 */
const PREVIEW_BG_STYLE: React.CSSProperties = {
  background: 'linear-gradient(to bottom, #dbeafe 0%, #ede9fe 45%, #d1fae5 100%)',
}

export default function KilnView({ onGoRealm }: KilnViewProps) {
  const characterId = useAppStore((s) => s.characterId)
  const items = useCodexStore((s) => s.items)
  const load = useCodexStore((s) => s.load)
  const addFromSynthesis = useCodexStore((s) => s.addFromSynthesis)
  const isNewCategory = useCodexStore((s) => s.isNewCategory)
  const addAffinity = useAffinityStore((s) => s.add)
  const { fire } = useShellFairy() // 合成成功→右下コレットが反応

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

  // 合成（撮り直しの「もう一回合成」と共通の生成本体）。
  const runSynthesis = useCallback(
    async (onFailPhase: KilnPhase) => {
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
        fire(emotionForGenerated())
      } catch (err) {
        setError(err instanceof Error ? err.message : '合成に失敗しました')
        setPhase(onFailPhase)
      }
    },
    [selectedItems, characterId, fire],
  )

  const handleSynthesize = useCallback(() => {
    if (selected.length !== 2 || phase !== 'select') return
    void runSynthesis('select')
  }, [selected, phase, runSynthesis])

  const handleReroll = useCallback(() => {
    if (selected.length !== 2) return
    void runSynthesis('result')
  }, [selected, runSynthesis])

  const handleConfirm = useCallback(async () => {
    if (!result || saving || selected.length !== 2) return
    setSaving(true)
    setError(null)
    try {
      const isNew = isNewCategory(result.category)
      await addFromSynthesis(result, selected[0], selected[1])
      // 合成は特別な体験＝絆も大きめに増やす。
      addAffinity(AFFINITY_PER_ITEM)
      setPhase('saved')
      fire(emotionForConfirm(isNew))
    } catch (err) {
      setError(err instanceof Error ? err.message : '妖精界への登録に失敗しました')
    } finally {
      setSaving(false)
    }
  }, [result, saving, selected, addFromSynthesis, isNewCategory, addAffinity, fire])

  const resetToSelect = useCallback(() => {
    setResult(null)
    setError(null)
    setSelected([])
    setPhase('select')
  }, [])

  if (items.length < 2) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm text-slate-500">合成にはアイテムが2つ以上必要だよ</p>
        <p className="text-xs text-slate-400">図鑑から召喚して、アイテムを集めてこよう</p>
      </div>
    )
  }

  return (
    <div className="relative flex w-full max-w-md flex-col gap-3">
      {/* 選択中の素材プレビュー（合成前・結果表示中は隠す） */}
      {(phase === 'select' || phase === 'generating') && (
        <div className="flex items-center justify-center gap-3">
          <SlotPreview item={selectedItems[0]} label="素材A" />
          <span className="text-xl font-bold text-violet-400">+</span>
          <SlotPreview item={selectedItems[1]} label="素材B" />
        </div>
      )}

      {/* 合成ボタン */}
      {phase === 'select' && (
        <>
          <button
            type="button"
            onClick={handleSynthesize}
            disabled={selected.length !== 2}
            className="mx-auto rounded-full bg-lavender px-8 py-2.5 font-bold text-white shadow-pop transition active:scale-95 disabled:opacity-40"
          >
            合成する
          </button>
          <p className="text-center text-xs text-slate-400">
            {selected.length < 2 ? 'アイテムを2つえらんでね' : '2つを混ぜて新しいアイテムを作る？'}
          </p>
        </>
      )}

      {error && <p className="text-center text-xs text-peach">{error}</p>}

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
                  isSelected ? 'bg-lavender/20 ring-2 ring-lavender' : 'bg-white shadow-pop'
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
          </div>

          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving}
            className="rounded-full bg-mint px-8 py-2.5 font-bold text-slate-900 shadow-pop transition active:scale-95 disabled:opacity-50"
          >
            {saving ? '登録中…' : '妖精界にしまう'}
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReroll}
              disabled={saving}
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-bold text-slate-500 transition active:scale-95 disabled:opacity-50"
            >
              もう一回合成
            </button>
            <button
              type="button"
              onClick={resetToSelect}
              disabled={saving}
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-bold text-slate-500 transition active:scale-95 disabled:opacity-50"
            >
              素材を変える
            </button>
          </div>
        </div>
      )}

      {/* 保存後：妖精界へ誘導 */}
      {phase === 'saved' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-600">
            <SparkleIcon className="h-4 w-4 text-mint" />
            妖精界にあらわれたよ
          </p>
          <div className="flex items-center gap-3">
            {onGoRealm && (
              <button
                type="button"
                onClick={() => {
                  resetToSelect()
                  onGoRealm()
                }}
                className="rounded-full bg-mint px-6 py-2.5 font-bold text-slate-900 shadow-pop transition active:scale-95"
              >
                妖精界で見る
              </button>
            )}
            <button
              type="button"
              onClick={resetToSelect}
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-bold text-slate-500 transition active:scale-95"
            >
              つづけて合成
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
