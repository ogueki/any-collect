import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useCollectionStore } from '../../store/collectionStore'
import { useChatStore } from '../../store/chatStore'
import { useCodexStore } from '../../store/codexStore'
import { useGaugeStore, GAUGE_MAX } from '../../store/gaugeStore'
import { useAffinityStore, AFFINITY_PER_ITEM } from '../../store/affinityStore'
import { useOnboardingStore } from '../../store/onboardingStore'
import { imageGenProvider } from '../../lib/ai/imageGen'
import { emotionForGenerated } from '../../lib/character/reaction'
import { speakLine } from '../../lib/audio/useSpeak'
import { COLLECTION_REVEAL_LINE, SUMMON_COACH_LINE, SUMMON_COACH_NOTE } from '../onboarding/script'
import GeneratingOverlay from '../../components/GeneratingOverlay'
import { failureLine } from '../../lib/character/failureLines'
import { summonLine } from '../../lib/character/summonLines'
import { useShellFairy } from '../../components/shellFairy'
import { SparkleIcon } from '../../components/icons'
import { CATEGORY_CODE, CATEGORY_EMOJI, CATEGORY_LABEL, CATEGORY_ORDER } from '../../lib/category'
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
 * ときだけ、図鑑エントリ1つ → 透過アイテムを Gemini で生成しコレットのたからばこに入れる
 * （旧 KilnView の単体化ロジックをここへ移設）。生成は成功時だけまほうパワーを消費・図鑑は消費しない。
 */

/** ISO 8601 を「2026/7/2」形式に。 */
function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ja-JP')
}

/** 召喚結果プレビューの背景＝やわらかいパステル地（透過アイテムが映える）。 */
const PREVIEW_BG_STYLE: React.CSSProperties = {
  background: 'linear-gradient(to bottom, #dbeafe 0%, #ede9fe 45%, #d1fae5 100%)',
}

/**
 * 召喚のフェーズ（idle＝閲覧中／生成中／結果プレビュー）。
 *
 * ⚠️ かつて生成完了と結果カードの間に「出現の演出」（`SummonReveal`・光が集まって弾ける
 * 1.5秒）を挟んでいたが**不採用にした**＝待ち画面（`GeneratingOverlay`）が魔法陣＋"溜め"に
 * 作り替わった結果、**同じ「光が集まって弾ける」を2回やる**形になり、後ろの花火が payoff では
 * なく重複になったため（理由＝DECISIONS 2026-08-12）。
 */
type SummonPhase = 'idle' | 'generating' | 'result'

/**
 * 各章の末尾に見せる空きマスの数（**後退式**＝いま埋まっている数のうしろに、常にこの数だけ足す）。
 *
 * 狙い＝**器が有限に見える**こと。埋まっていない枠が視界にあるだけで「集める先がある」と分かる
 * （＝レビュー #3「"いっぱいにする"が定義されていなくて進捗が見えない」への手当て）。
 * ⚠️ ただし埋めるたびに先が伸びるので**実際には終わらない**。「終わる器」にしたくなったら、
 * ここをカテゴリごとの固定目標（例：12マス）に変えて、埋まったら達成表示を出す設計へ切り替える。
 */
const EMPTY_SLOT_LOOKAHEAD = 3

/**
 * 標本を貼る角度（±0.8度）。手で貼ったムラを出すためのもので、**id から決定的に**出す
 * （乱数だと再レンダーのたびに動いて安っぽくなる）。強くすると散らかって見えるので 1 度未満に抑える。
 */
function tiltFor(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return ((h % 5) - 2) * 0.4
}

/** カテゴリの判子＝丸いインクの印。既存の絵文字にフィルタを掛ける方式は「灰色の塊」になるので使わない。 */
function CategorySeal({ letter }: { letter: string }) {
  return (
    <span
      aria-hidden
      className="absolute bottom-2 right-2 flex h-7 w-7 -rotate-12 items-center justify-center rounded-full border border-ink/25 text-[11px] font-bold text-ink/25"
    >
      {letter}
    </span>
  )
}

/**
 * 図鑑のマス＝**台紙の上に置いた1枚の標本カード**。
 * 写真をページに直接置くと「アプリのサムネ」に見えるので、台紙よりわずかに明るい紙を1枚敷き、
 * 白フチ（マット）に載せた写真をテープで留める＝「紙の上に貼ってある」を作る。
 * カードごと 1 度未満だけ傾けて手で貼ったムラを出す（角度は id から決定的＝再レンダーで動かない）。
 */
function SpecimenCard({
  entry,
  url,
  glow,
  code,
  onClick,
}: {
  entry: CollectionEntry
  url?: string
  glow: boolean
  code: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ transform: `rotate(${tiltFor(entry.id)}deg)` }}
      className="relative flex flex-col rounded-[3px] border border-paperEdge/70 bg-paperCard p-2 text-left shadow-card transition active:scale-95"
    >
      <div className="relative">
        {/* 実写クロップ（透過ではない）を白いマットに載せる。将来クロップを切り抜き（透過）にしたら
            ここを薄い楕円の座布団に差し替える。 */}
        <div className={`bg-white p-1 shadow-specimen ${glow ? 'ring-1 ring-mint' : ''}`}>
          <img src={url} alt={entry.name} className="aspect-square w-full object-cover" />
        </div>
        {/* テープは写真の角から**外へ**はみ出させる（紙に留めているので、写真の内側に
            収まっていると「写真の上に描いた模様」に見える）。位置は -45°の対角方向へ。 */}
        <span aria-hidden className="zukan-tape absolute -left-3 top-1 -rotate-45" />
        <span aria-hidden className="zukan-tape absolute -right-3 bottom-1 -rotate-45" />
      </div>

      {/* 標本ラベル。判子と重ならないよう右に逃がす。 */}
      <div className="mt-2 pr-8">
        <p className="font-sans text-[10px] tracking-widest text-ink/45">{code}</p>
        <p className="line-clamp-1 text-sm font-bold leading-snug">{entry.name}</p>
        <p className="mt-1 border-t border-paperEdge/70 pt-1 text-[10px] text-ink/60">
          見つけた回数{'　'}
          {entry.count}
        </p>
      </div>

      <CategorySeal letter={code.charAt(0)} />
    </button>
  )
}

/**
 * 空きマス＝「まだ見つけていない席」。
 * ⚠️ `？` だけだと単なる余白に見える。**番号を振る**と「F-007 はまだ埋まっていない」という
 * 具体的な欠けになり、集める先があることが伝わる（ChatGPT ラフからの採用）。
 * 色は紙とほぼ同じにしない（旧実装はコントラスト比 1.14 で画面上に存在しなかった）。
 */
function EmptySlot({ code }: { code: string }) {
  return (
    <div
      aria-hidden
      className="flex flex-col rounded-[3px] border border-dashed border-paperEdge bg-ink/[0.04] p-2"
    >
      <div className="flex aspect-square w-full items-center justify-center text-2xl font-bold text-ink/25">
        ？
      </div>
      <div className="mt-2">
        <p className="font-sans text-[10px] tracking-widest text-ink/35">{code}</p>
        <p className="text-sm font-bold text-ink/35">未発見</p>
        {/* 埋まっているカードと高さを揃える（回数の1行ぶん） */}
        <p className="mt-1 border-t border-transparent pt-1 text-[10px] text-transparent">
          {'　'}
        </p>
      </div>
    </div>
  )
}

/**
 * 並び替え/絞り込みのチップ（横スクロールで縮まないよう shrink-0）。
 * ⚠️ 紙の上には**アプリのピル（丸い紫＋光る影）を置かない**。プラスチックのボタンが紙に載って
 * 見えて台紙の見立てが壊れるため、インクで刷った矩形に寄せる。
 */
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
      className={`shrink-0 whitespace-nowrap rounded-[3px] px-3 py-1 text-xs font-bold transition active:scale-95 ${
        active ? 'bg-ink text-paper' : 'border border-paperEdge text-ink/60'
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
  const appendSummonLine = useChatStore((s) => s.appendSummonLine)
  const { fire } = useShellFairy() // 召喚成功→右下コレットが反応

  // オンボ：図鑑を初めて開いたときのヒーローリビール（phase='reveal' かつ 1件以上）。
  const onboardingReveal = useOnboardingStore((s) => s.phase === 'reveal')

  const [selected, setSelected] = useState<CollectionEntry | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [filter, setFilter] = useState<ItemCategory | 'all'>('all')
  // 開いた直後は「新しい順」＝**さっき撮ったものがいちばん上**にある状態にする。
  // カメラ→図鑑の導線で「いま撮ったやつ見たい」が最頻の動機なので、整理された章立て（カテゴリ順）より
  // 直近の確認を優先する。章立て・空きマスはタブを切り替えたときに出会う。
  const [sortMode, setSortMode] = useState<'category' | 'recent'>('recent')

  // 召喚の状態。
  const [summonPhase, setSummonPhase] = useState<SummonPhase>('idle')
  const [summonResult, setSummonResult] = useState<GeneratedItem | null>(null)
  /** 保存後のアイテム id。ホームで「立ち絵の横に出すのはどれか」を指すのに使う。 */
  const [summonItemId, setSummonItemId] = useState<string | null>(null)
  const [summonError, setSummonError] = useState<string | null>(null)

  const gaugeFull = gaugeValue >= GAUGE_MAX

  // マウント時に図鑑を読み込む（ローカルなので軽い）。
  useEffect(() => {
    void load()
  }, [load])

  // リビールは「オンボの reveal フェーズ」かつ「図鑑に1件以上ある」ときだけ（空の図鑑では出さない）。
  const showReveal = onboardingReveal && entries.length > 0

  // 表示された瞬間に一度だけコレットのセリフを読み上げ＋立ち絵を反応させる（再発火しないよう ref ガード）。
  const revealSpoke = useRef(false)
  useEffect(() => {
    if (!showReveal || revealSpoke.current) return
    revealSpoke.current = true
    fire(COLLECTION_REVEAL_LINE.expression)
    void speakLine(COLLECTION_REVEAL_LINE)
  }, [showReveal, fire])

  // リビールを閉じる＝オンボ完了。まほうパワーは撮影/会話で自然に貯める（シードで満タンにはしない）。
  // 満タンに到達したら召喚コーチ（Beat4）が出る＝召喚は図鑑を理解した先の"自然な発見"になる。
  const dismissReveal = useCallback(() => {
    useOnboardingStore.getState().finish()
  }, [])

  // オンボ Beat4：まほうパワーが初めて満タンになったとき、召喚（＋まほうパワー）を一度だけ教える。
  // まほうが自然に満タンになった図鑑で一度だけ。リビール表示中/召喚中は出さない。
  // 表示は store の seen から**レンダー時に導出**（effect 内で local setState しない）。
  const summonCoachSeen = useOnboardingStore((s) => s.summonCoachSeen)
  const showSummonCoach = gaugeFull && !showReveal && summonPhase === 'idle' && !summonCoachSeen
  const summonSpoke = useRef(false)
  useEffect(() => {
    if (!showSummonCoach || summonSpoke.current) return
    summonSpoke.current = true
    fire(SUMMON_COACH_LINE.expression)
    void speakLine(SUMMON_COACH_LINE)
  }, [showSummonCoach, fire])

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

  /**
   * 標本番号（F-001 等）。**カテゴリ内の初発見の順**に振るので、絞り込みや並び替えを変えても動かない。
   * ＝「カタログの品番」ではなく「その人の図鑑の何番目か」なので、全種リスト（分母）が
   * 未定のままでも矛盾しない。※エントリを削除すると以降が繰り上がる（割り切り）。
   */
  const codeOf = useMemo(() => {
    const byCategory = new Map<ItemCategory, CollectionEntry[]>()
    for (const entry of entries) {
      const list = byCategory.get(entry.category)
      if (list) list.push(entry)
      else byCategory.set(entry.category, [entry])
    }
    const map = new Map<string, string>()
    byCategory.forEach((list, category) => {
      ;[...list]
        .sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt))
        .forEach((entry, i) => {
          map.set(entry.id, `${CATEGORY_CODE[category]}-${String(i + 1).padStart(3, '0')}`)
        })
    })
    return map
  }, [entries])

  /** カテゴリごとの総数（絞り込みに影響されない＝空きマスの採番と「◯種 発見」に使う）。 */
  const totalByCategory = useMemo(() => {
    const map = new Map<ItemCategory, number>()
    for (const entry of entries) map.set(entry.category, (map.get(entry.category) ?? 0) + 1)
    return map
  }, [entries])

  /**
   * 章立て（カテゴリ＝章）。見出しで区切ると、縦スクロールのままでも「めくっている」感じが出る
   * ＝見開き/ページめくりを実装しない代わりの構造（実装コストが高く縦スクロールと喧嘩するため）。
   * 「新しい順」のときは時系列が主役なので章に割らず1枚の紙にする。
   * 章番号は「1件以上あるカテゴリ」の CATEGORY_ORDER 順で振る＝絞り込んでも番号が動かない。
   */
  const sections = useMemo(() => {
    if (sortMode === 'recent') {
      return [{ key: 'recent', category: null, chapter: 0, items: visibleEntries }]
    }
    const byCategory = new Map<ItemCategory, CollectionEntry[]>()
    for (const entry of visibleEntries) {
      const list = byCategory.get(entry.category)
      if (list) list.push(entry)
      else byCategory.set(entry.category, [entry])
    }
    // visibleEntries は既にカテゴリ順→初発見順で並んでいるので、章の中の順序はそのままでよい。
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
      key: c as string,
      category: c,
      chapter: availableCategories.indexOf(c) + 1,
      items: byCategory.get(c) as CollectionEntry[],
    }))
  }, [visibleEntries, sortMode, availableCategories])

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

  /**
   * このエントリを話題にしてホームへ渡す（アルバムの「この写真の話をする」と同じ流儀）。
   * 返事を待たずに遷移する＝待ち時間はホームのタイピング表示が受け持つ（楽観的UI）。
   */
  const handleTalk = (entry: CollectionEntry) => {
    closeDetail()
    go('home')
    void useChatStore.getState().talkAboutEntry(entry, characterId)
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

  // 召喚：図鑑エントリ1つ → 透過アイテムを生成しコレットのたからばこに入れる。
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
        const saved = await addFromGenerated(generated, entry.id)
        // 召喚は特別な体験＝絆も大きめに増やす。
        addAffinity(AFFINITY_PER_ITEM, 'item')
        setSummonResult(generated)
        // 保存された id を握っておく＝カードを閉じたあと、ホームでコレットが喋るときに
        // このアイテムを立ち絵の横に出すため（`ChatMessage.itemId`）。
        setSummonItemId(saved.id)
        // 待ち画面（魔法陣＋"溜め"）からそのまま結果カードへ。
        setSummonPhase('result')
        fire(emotionForGenerated()) // 右下コレットが大喜び
      } catch {
        // 失敗もコレットの言葉で受ける（生のエラー文を出さない＝キャラを崩さない）。
        const line = failureLine('summon')
        setSummonError(line.text)
        fire(line.expression)
        setSummonPhase('idle')
      }
    },
    [summonPhase, gaugeFull, characterId, spendGauge, addFromGenerated, addAffinity, fire],
  )

  /**
   * カードを閉じる＝**ホームへ渡す**（Ⅰ-5b）。コレットのひとことを会話履歴に積んでから
   * ホームへ飛ばすと、大セリフ・表情・立ち絵の反応がそのまま乗る（`appendSummonLine`）。
   * セリフは生成時に一緒に返ってきているので **API は叩かない**。取れていなければ固定セリフ。
   */
  const closeSummonResult = () => {
    if (summonResult && summonItemId) {
      const line = summonResult.comment?.trim() || summonLine(summonResult.name)
      appendSummonLine(line, summonItemId, emotionForGenerated())
    }
    setSummonResult(null)
    setSummonItemId(null)
    setSummonPhase('idle')
    go('home')
  }

  return (
    // 図鑑だけ「紙の台紙」にする＝色と書体で"別の場所"を出す（アルバムはカメラロール風のまま＝対比）。
    // 角丸を落として内側に影を入れる＝「浮いたカード」でなく「紙の面」に見せる。
    // ⚠️ 明朝（font-zukan）を**ここに付けない**。この器の内側には詳細モーダル・召喚の待ち画面・
    // 結果プレビュー・オンボのリビールが入っており、ルートに付けると**コレットのセリフまで明朝**に
    // なる（GeneratingOverlay は窯と共用なので入口によって見た目が変わる）。
    // 明朝は「図鑑の中身（章見出しと標本カード）」だけに opt-in する。
    <div className="zukan-paper flex w-full max-w-md flex-col rounded-sm px-3 py-4 text-ink shadow-sheet">
      {/* 読み込み中 */}
      {status === 'loading' && entries.length === 0 && (
        <p className="mt-10 animate-pulse text-center text-sm text-ink/50">読み込み中…</p>
      )}

      {/* エラー */}
      {status === 'error' && <p className="mt-10 text-center text-sm text-peach">{error}</p>}

      {/* 空状態：誘導（コレットは右下の共通シェルにいる） */}
      {status !== 'loading' && status !== 'error' && entries.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-bold text-ink/70">まだ図鑑がからっぽだよ。</p>
          <p className="text-sm text-ink/50">カメラでいろんなものを見つけてこよう！</p>
        </div>
      )}

      {/* オンボ Beat4：召喚コーチ（初めて満タンになった一度だけ・OK で閉じるとバナーに引き継ぐ） */}
      {showSummonCoach && (
        <div className="animate-reveal mb-3 flex flex-col items-center gap-2 rounded-2xl bg-white px-4 py-3 text-center shadow-pop ring-1 ring-lavender/40">
          <p className="text-sm font-bold leading-relaxed text-slate-700">{SUMMON_COACH_LINE.text}</p>
          {/* 仕組みの説明はシステムの補足として添える（コレットにルールを喋らせない）。 */}
          <p className="text-xs leading-relaxed text-slate-400">{SUMMON_COACH_NOTE}</p>
          <button
            type="button"
            onClick={() => useOnboardingStore.getState().markSummonCoachSeen()}
            className="rounded-full bg-lavender px-6 py-2 text-xs font-bold text-white shadow-pop transition active:scale-95"
          >
            やってみる！
          </button>
        </div>
      )}

      {/* 召喚できるよバナー（まほうパワーが満タンのときだけ・コーチ表示中は出さない） */}
      {entries.length > 0 && gaugeFull && summonPhase === 'idle' && !showSummonCoach && (
        <div className="mb-3 rounded-2xl bg-mint/20 px-3 py-2 text-center ring-1 ring-mint">
          <p className="text-xs font-bold text-emerald-700">
            まほうパワーが満タン！ 図鑑から1つえらんで召喚しよう
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
                className={`rounded-[3px] px-3 py-1 text-xs font-bold transition active:scale-95 ${
                  sortMode === mode ? 'bg-ink text-paper' : 'border border-paperEdge text-ink/60'
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

      {/* 標本の台紙。章（カテゴリ）ごとに区切り、末尾に空きマスを見せる。
          まほうパワーが満タンのマスは召喚できるヒントとして縁を色付ける。 */}
      {entries.length > 0 && (
        // 明朝はここから内側だけ＝章見出しと標本カード（＝紙に刷ってある部分）。
        <div className="flex flex-col gap-4 font-zukan">
          {sections.map((section) => (
            <section key={section.key}>
              {section.category && (
                <h2 className="zukan-rule mb-3 flex items-baseline pb-1">
                  <span className="text-sm font-bold tracking-wide">
                    第{section.chapter}章{'　'}
                    {CATEGORY_EMOJI[section.category]} {CATEGORY_LABEL[section.category]}
                  </span>
                  <span className="ml-auto font-sans text-[10px] text-ink/50">
                    {totalByCategory.get(section.category) ?? 0}種 発見
                  </span>
                </h2>
              )}
              <div className="grid grid-cols-2 items-start gap-x-3 gap-y-4">
                {section.items.map((entry) => (
                  <SpecimenCard
                    key={entry.id}
                    entry={entry}
                    url={urls.get(entry.id)}
                    glow={gaugeFull}
                    code={codeOf.get(entry.id) ?? ''}
                    onClick={() => setSelected(entry)}
                  />
                ))}
                {/* 空きマスは「章の末尾」に置くものなので、章に割らない「新しい順」では出さない。 */}
                {section.category &&
                  Array.from({ length: EMPTY_SLOT_LOOKAHEAD }, (_, i) => {
                    const next = (totalByCategory.get(section.category) ?? 0) + i + 1
                    return (
                      <EmptySlot
                        key={`empty-${section.key}-${i}`}
                        code={`${CATEGORY_CODE[section.category]}-${String(next).padStart(3, '0')}`}
                      />
                    )
                  })}
              </div>
            </section>
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
                  召喚する
                </button>
              ) : (
                <p className="mt-4 text-center text-xs text-slate-400">
                  まほうパワーがたまると、召喚できるよ
                </p>
              ))}

            {/* これの話をする（Ⅰ-4c）。**常に枠線＝控えめ**にする＝召喚は1日1回の希少な行為なので、
                満タンのときに同じ強さのボタンが2つ並んで主役を食い合わないようにする。
                見た目を状態で変えないので「さっきと違うボタン」に見えることもない。 */}
            {!confirmDelete && (
              <button
                type="button"
                onClick={() => handleTalk(selectedLive)}
                className="mt-2 w-full rounded-full border border-lavender py-2.5 font-bold text-lavender transition active:scale-95"
              >
                これの話をする
              </button>
            )}

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
          <GeneratingOverlay characterId={characterId} context="summoning" />
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
              たからばこに増えたよ
            </p>

            {/* ボタンは1つ（Ⅰ-5b）。押すと**ホームへ戻ってコレットがこれにひとこと言う**ので、
                ここで分岐を作らない。たからばこへはホームのドックから行ける。 */}
            <div className="mt-4 flex items-center justify-center">
              <button
                type="button"
                onClick={closeSummonResult}
                className="rounded-full bg-mint px-10 py-2.5 font-bold text-slate-900 shadow-pop transition active:scale-95"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* オンボ：図鑑を初めて開いたときのヒーローリビール（③）。
          「ふたりで図鑑をつくろう」を伝える。閉じるとオンボ完了（まほうは撮影/会話で自然に貯める）。 */}
      {showReveal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 px-6">
          <div className="animate-reveal flex w-full max-w-xs flex-col items-center gap-4 rounded-3xl bg-white px-6 py-6 text-center shadow-pop">
            <SparkleIcon className="h-8 w-8 text-mint" />
            <p className="text-base font-bold leading-relaxed text-slate-700">
              {COLLECTION_REVEAL_LINE.text}
            </p>
            <button
              type="button"
              onClick={dismissReveal}
              className="rounded-full bg-mint px-7 py-2.5 text-sm font-bold text-slate-900 shadow-pop transition active:scale-95"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
