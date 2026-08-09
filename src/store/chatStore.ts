import { create } from 'zustand'
import type { ChatMessage, Photo, ReunionBucket } from '../types'
import { FAIRY_EXPRESSIONS, type FairyExpression } from '../lib/character/CharacterRenderer'
import { chatProvider } from '../lib/ai/chat'
import { useGaugeStore, GAUGE_PER_CHAT, GAUGE_MAX } from './gaugeStore'
import { useAffinityStore, AFFINITY_PER_CHAT } from './affinityStore'
import { useMemoryStore } from './memoryStore'
import { useCollectionStore } from './collectionStore'
import { useAlbumStore } from './albumStore'
import { buildGroundingNotes } from '../lib/grounding'
import { blobToDownscaledDataUrl } from '../lib/image/downscale'
import { failureLine } from '../lib/character/failureLines'

export type ChatStatus = 'idle' | 'sending' | 'error'

/**
 * 会話の状態（v2）。履歴は localStorage に永続する（STEP2e＝会話の連続性）＝
 * 閉じて開いても会話が続く。記憶・なつき・まほうパワーと同じ「軽量値はストア直」の流儀
 * （STEP6 で Supabase に移すときは readInitial/persist の2関数を差し替える）。
 */

/** 何メッセージ進むごとに記憶を要約するか（＝約3往復。頻度を絞ってコスト/接地を両立）。 */
const CONSOLIDATE_EVERY = 6

const STORAGE_KEY = 'anycollect.chat.v1'
/** 永続に残す上限（≒30往復）。これを超えたぶんは古い方から捨てる。 */
const MAX_MESSAGES = 60
/** 絶対上限。要約が失敗し続けても履歴を無限には伸ばさない。 */
const HARD_MAX_MESSAGES = 200
/** モデルに送る直近件数（≒6往復＝CONSOLIDATE_EVERY の2ブロック分）。履歴が伸びてもトークンは頭打ち。 */
const HISTORY_WINDOW = 12
/** 最後の発話からこの分数の間は、第一声を出さない（＝会話の続きのまま） */
const REUNION_QUIET_MIN = 30
/** 「久しぶり」を名乗るのに最低これだけは空けたい時間（深夜0時をまたいだだけで久しぶり扱いしない） */
const REUNION_LONG_HOURS = 3

/** 現地時刻→時間帯ラベル（サーバ側 allowlist と対応。会話の接地・挨拶に使う）。 */
export function timeOfDayLabel(hour: number): string {
  if (hour <= 4) return '深夜'
  if (hour <= 10) return '朝'
  if (hour <= 15) return '昼'
  if (hour <= 18) return '夕方'
  return '夜'
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

/**
 * 最後の発話からの間隔で「どんな再会か」を決める（サーバ側 allowlist と対応）。
 * null＝ついさっきまで話していた＝第一声を出さずに会話の続きを見せる。
 */
export function reunionBucket(lastAt: string | null, now: Date): ReunionBucket | null {
  if (!lastAt) return 'first'
  const last = new Date(lastAt)
  if (Number.isNaN(last.getTime())) return 'first'
  const elapsedMin = (now.getTime() - last.getTime()) / 60_000
  if (elapsedMin < REUNION_QUIET_MIN) return null
  // 「久しぶり」は日付が変わっただけでは名乗らない（23時→翌1時は"さっきの続き"の感覚）。
  const longEnough = elapsedMin >= REUNION_LONG_HOURS * 60
  return !isSameLocalDay(last, now) && longEnough ? 'days' : 'back'
}

/**
 * 履歴を上限まで切り詰める。**捨てるのは記憶へ要約済みの分だけ**＝
 * 未要約の会話を消すと、その内容は二度と記憶に入らない（永続化したので取り返しがつかない）。
 * 要約がずっと失敗している場合だけ、絶対上限を超えたぶんを強制的に捨てる。
 */
export function trimMessages(
  messages: ChatMessage[],
  consolidatedCount: number,
): { messages: ChatMessage[]; consolidatedCount: number } {
  if (messages.length <= MAX_MESSAGES) return { messages, consolidatedCount }
  let remove = Math.min(messages.length - MAX_MESSAGES, consolidatedCount)
  const hardOver = messages.length - HARD_MAX_MESSAGES
  if (hardOver > remove) remove = hardOver
  if (remove <= 0) return { messages, consolidatedCount }
  return {
    messages: messages.slice(remove),
    consolidatedCount: Math.max(0, consolidatedCount - remove),
  }
}

interface PersistedChat {
  v: 1
  messages: ChatMessage[]
  consolidatedCount: number
}

function isFairyExpression(v: unknown): v is FairyExpression {
  return typeof v === 'string' && (FAIRY_EXPRESSIONS as readonly string[]).includes(v)
}

function isChatMessage(v: unknown): v is ChatMessage {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    (r.role === 'user' || r.role === 'fairy') &&
    typeof r.content === 'string' &&
    typeof r.createdAt === 'string' &&
    (r.emotion === undefined || isFairyExpression(r.emotion)) &&
    (r.voiceDirection === undefined || typeof r.voiceDirection === 'string') &&
    (r.origin === undefined || r.origin === 'camera' || r.origin === 'album') &&
    (r.photoId === undefined || typeof r.photoId === 'string')
  )
}

function readInitial(): { messages: ChatMessage[]; consolidatedCount: number } {
  const empty = { messages: [], consolidatedCount: 0 }
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return empty
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return empty
    const r = parsed as Record<string, unknown>
    const all = Array.isArray(r.messages) ? r.messages.filter(isChatMessage) : []
    const messages = all.slice(-MAX_MESSAGES)
    const dropped = all.length - messages.length
    const saved =
      typeof r.consolidatedCount === 'number' && Number.isFinite(r.consolidatedCount)
        ? r.consolidatedCount
        : 0
    // 先頭を落としたぶんカウンタもずらす（「先頭から何件が要約済みか」の意味を保つ）。
    const consolidatedCount = Math.min(Math.max(0, saved - dropped), messages.length)
    return { messages, consolidatedCount }
  } catch {
    return empty
  }
}

function persist(messages: ChatMessage[], consolidatedCount: number): void {
  try {
    if (typeof localStorage === 'undefined') return
    const payload: PersistedChat = { v: 1, messages, consolidatedCount }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // 保存に失敗しても会話自体は動く（永続だけ諦める）。
  }
}

/** 「この写真の話をする」でユーザー側に表示する文（モデルにもこの文が userInput として渡る）。 */
export const TALK_ABOUT_PHOTO_LINE = 'この写真の話をしたいな'

/** 撮影日から「どのくらい前か」をざっくり日本語に（コレットが時間の経過に触れられるように）。 */
function elapsedLabel(iso: string, now: Date): string | null {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000)
  if (days <= 0) return '今日'
  if (days === 1) return '昨日'
  if (days < 7) return `${days}日前`
  if (days < 30) return `${Math.floor(days / 7)}週間くらい前`
  if (days < 365) return `${Math.floor(days / 30)}ヶ月くらい前`
  return `${Math.floor(days / 365)}年くらい前`
}

/**
 * 写真1枚を「いまの話題」の短いノートにする。**この1リクエストにだけ載る**（topicNote）。
 * 名前・いつ撮ったか・そのときコレットが言ったことだけ＝分かっていること以上を足させない。
 */
export function buildPhotoTopicNote(photo: Photo, now = new Date()): string {
  const when = elapsedLabel(photo.createdAt, now)
  const parts = [
    `きみが、アルバムから${photo.subjectName ? `「${photo.subjectName}」の` : ''}写真を持ってきて、この話をしたいと言っている。`,
  ]
  if (when) parts.push(`${when}、一緒に見たもの。`)
  // caption（客観的な説明）はアルバムの表示からは外したが、**モデルへの手がかりとしては渡す**。
  // これが無いと、名前だけの写真で話す材料が足りず「嬉しいよ」しか言えなくなる。
  if (photo.caption) parts.push(`どんなものか：${photo.caption}`)
  if (photo.comment) parts.push(`そのときコレットは「${photo.comment}」と言った。`)
  return parts.join('')
}

/** 会話に載せる接地文脈（好感度・記憶・図鑑/アルバム傾向・時間帯）を集める。send/opening 共用。 */
async function gatherChatContext() {
  // persona の「好感度別の口調」は3段しか無いので、無限に伸びるレベルでなく tier を渡す。
  const affinityLevel = useAffinityStore.getState().toneTier()
  const memoryFacts = useMemoryStore.getState().facts

  // 図鑑・アルバムの傾向を接地ノートに（STEP2c）。会話タブ単独起動でも接地できるよう、
  // 未ロードなら読む（データは小さい。collect の「メモリ空なら永続層」idiom と同じ発想）。
  const col = useCollectionStore.getState()
  if (col.entries.length === 0 && col.status === 'idle') await col.load()
  const alb = useAlbumStore.getState()
  if (alb.photos.length === 0 && alb.status === 'idle') await alb.load()
  const groundingNotes = buildGroundingNotes({
    entries: useCollectionStore.getState().entries,
    photos: useAlbumStore.getState().photos,
  })
  if (import.meta.env.DEV) console.debug('[grounding]', groundingNotes)

  return {
    affinityLevel,
    memoryFacts,
    groundingNotes,
    timeOfDay: timeOfDayLabel(new Date().getHours()),
  }
}

interface ChatState {
  messages: ChatMessage[]
  status: ChatStatus
  error: string | null
  /** コレットの第一声を生成中か（送信ブロックはしない・ホームのタイピング表示用） */
  opening: boolean
  /** 第一声をこのセッションで既に要求したか（再マウントでの重複呼び出しガード） */
  openingRequested: boolean
  /** 返信が来るたびに +1。立ち絵の一発アニメ（animateKey）の発火に使う */
  replyNonce: number
  /** 先頭から何件が記憶へ要約済みか（永続。要約トリガーと切り詰めの基準） */
  consolidatedCount: number
  /** ユーザー入力を送り、妖精の応答を履歴に追加する。成功したら true（呼び出し側の入力クリア用） */
  send: (userInput: string, personaId: string) => Promise<boolean>
  /** 間が空いていれば、コレットから第一声を話しかける（セッション1回・失敗は握りつぶし） */
  openConversation: (personaId: string) => Promise<void>
  /**
   * カメラでのコレットの発言を会話履歴に積む（Ⅰ-2）。API は叩かない＝もう喋ったものを残すだけ。
   * これで家に帰ったコレットが「さっき見せてくれた〜」と言える（カメラと家で別人にならない）。
   * 記憶には要約されない（`ChatMessage.origin` を参照）。
   */
  appendCameraLine: (content: string, emotion?: FairyExpression) => void
  /**
   * アルバムの写真を話題として持ち出す（Ⅰ-4b）。**ユーザー起点**なので毎回は起きない＝
   * 写真を接地ノート（毎回載る）に入れて機械的に蒸し返す設計を避けるための形。
   * 写真の情報は `topicNote` として**この1リクエストにだけ**載せ、以降は返事が履歴に残って続く。
   */
  talkAboutPhoto: (photo: Photo, personaId: string) => Promise<boolean>
  /** 未反映の会話を今すぐ記憶に要約する（`?debug=1` の手動発火） */
  consolidateMemoryNow: () => Promise<void>
  /** エラー表示を消す（入力し直したとき） */
  clearError: () => void
  /**
   * 検証用：履歴の時刻を過去にずらして「久しぶりの再訪」を作る（呼び出しは `?debug=1` のときだけ）。
   * 実機テストは本番 Vercel で行うため、iPhone では localStorage を直接いじれない。
   */
  debugAgeHistory: (hours: number) => void
  /** 会話を消す（履歴＋永続の削除。spec §9「削除を一級機能」） */
  reset: () => void
}

/** 付帯情報は増えるので位置引数でなくオブジェクトで受ける（呼び出し側の読みやすさ優先）。 */
type MessageExtras = Pick<ChatMessage, 'emotion' | 'voiceDirection' | 'origin' | 'photoId'>

function createMessage(
  role: ChatMessage['role'],
  content: string,
  extras: Partial<MessageExtras> = {},
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extras,
  }
}

export const useChatStore = create<ChatState>((set, get) => {
  /**
   * 未要約の会話を記憶へ流す。**成功したときだけ**「どこまで要約済みか」を進める
   * （失敗しても進めてしまうと、その会話は切り詰めで消えたきり記憶に入らない）。
   * 完了時に履歴が動いている可能性があるので、位置は件数でなくメッセージ id で解決する。
   */
  const runConsolidate = async (): Promise<void> => {
    const msgs = get().messages
    const tail = msgs.slice(get().consolidatedCount)
    if (tail.length === 0) return
    const lastId = tail[tail.length - 1].id
    // アプリ由来の発言（origin 付き）は記憶に要約しない（origin の定義を参照）。ただし
    // 「要約済み」としては前に進める＝進めないと切り詰められず、履歴が伸びたままになる。
    const summarizable = tail.filter((m) => m.origin === undefined)
    if (summarizable.length > 0) {
      const ok = await useMemoryStore.getState().consolidate(summarizable)
      if (!ok) return
    }
    const idx = get().messages.findIndex((m) => m.id === lastId)
    if (idx < 0) return
    const trimmed = trimMessages(get().messages, idx + 1)
    persist(trimmed.messages, trimmed.consolidatedCount)
    set(trimmed)
  }

  return {
    ...readInitial(),
    status: 'idle',
    error: null,
    opening: false,
    openingRequested: false,
    replyNonce: 0,

    send: async (userInput, personaId) => {
      const text = userInput.trim()
      if (!text || get().status === 'sending') return false

      // 送信前の履歴を provider に渡す（userInput は別引数で末尾に積まれる）。
      const history = get().messages
      set({ messages: [...history, createMessage('user', text)], status: 'sending', error: null })

      try {
        // 好感度レベル＋記憶＋図鑑/アルバム傾向＋時間帯を会話に載せる（サーバの system prompt で接地）。
        const context = await gatherChatContext()
        // モデルに送るのは直近の窓だけ（履歴が伸びてもトークンが線形に増えないように）。
        const reply = await chatProvider.sendMessage(history.slice(-HISTORY_WINDOW), text, {
          personaId,
          ...context,
        })
        const next = [...get().messages, createMessage('fairy', reply.text, { emotion: reply.emotion, voiceDirection: reply.voiceDirection })]
        const trimmed = trimMessages(next, get().consolidatedCount)
        persist(trimmed.messages, trimmed.consolidatedCount)
        set((s) => ({ ...trimmed, status: 'idle', replyNonce: s.replyNonce + 1 }))
        // 会話は「安い日常行動」＝まほうパワー＋絆を少し貯める（返事が来たときだけ）。
        // ライフサイクルでなくイベント側で加算し、タブ再マウントでの二重加算を避ける。
        useGaugeStore.getState().add(GAUGE_PER_CHAT)
        useAffinityStore.getState().add(AFFINITY_PER_CHAT, 'chat')

        // 数往復ごとに記憶を要約（非ブロッキング＝会話は待たせない）。
        if (get().messages.length - get().consolidatedCount >= CONSOLIDATE_EVERY) {
          void runConsolidate()
        }
        return true
      } catch {
        // 失敗はコレットの言葉で受ける（システムのエラー文をそのまま出さない＝キャラを崩さない）。
        // 原因の詳細はサーバのログにあり、ユーザーに見せる価値がない。
        // 返事が来なかった発話は履歴に残さない（残すとコレットが答えていない発話ごと
        // 毎回モデルに送られ、しかも永続してしまう）。入力は呼び出し側が復元する。
        persist(history, get().consolidatedCount)
        set({ messages: history, status: 'error', error: failureLine('chat').text })
        return false
      }
    },

    talkAboutPhoto: async (photo, personaId) => {
      if (get().status === 'sending') return false
      const history = get().messages
      // 話題を振ったのはユーザーなので user の発言として積む（サムネイルは photoId から引く）。
      set({
        messages: [
          ...history,
          createMessage('user', TALK_ABOUT_PHOTO_LINE, { photoId: photo.id, origin: 'album' }),
        ],
        status: 'sending',
        error: null,
      })
      try {
        const context = await gatherChatContext()
        // 写真そのものを添える＝撮影時のテキストだけでは材料ゼロの写真があるため。
        const image = await blobToDownscaledDataUrl(photo.blob).catch(() => undefined)
        // 写真も添えられず手がかりも無いなら**モデルを呼ばない**。材料ゼロで呼ぶと
        // 「〜って言ってたよね」と実在しない思い出を作る（failureLines の photoNoClue 参照）。
        if (!image && !photo.subjectName && !photo.caption && !photo.comment) {
          const line = failureLine('photoNoClue')
          const next = [
            ...get().messages,
            createMessage('fairy', line.text, { emotion: line.expression, origin: 'album' }),
          ]
          const trimmed = trimMessages(next, get().consolidatedCount)
          persist(trimmed.messages, trimmed.consolidatedCount)
          set((s) => ({ ...trimmed, status: 'idle', replyNonce: s.replyNonce + 1 }))
          return true
        }
        const reply = await chatProvider.sendMessage(
          history.slice(-HISTORY_WINDOW),
          TALK_ABOUT_PHOTO_LINE,
          { personaId, ...context, topicNote: buildPhotoTopicNote(photo), image },
        )
        const next = [
          ...get().messages,
          createMessage('fairy', reply.text, {
            emotion: reply.emotion,
            voiceDirection: reply.voiceDirection,
          }),
        ]
        const trimmed = trimMessages(next, get().consolidatedCount)
        persist(trimmed.messages, trimmed.consolidatedCount)
        set((s) => ({ ...trimmed, status: 'idle', replyNonce: s.replyNonce + 1 }))
        useGaugeStore.getState().add(GAUGE_PER_CHAT)
        useAffinityStore.getState().add(AFFINITY_PER_CHAT, 'chat')
        if (get().messages.length - get().consolidatedCount >= CONSOLIDATE_EVERY) {
          void runConsolidate()
        }
        return true
      } catch {
        // send と同じ扱い＝返事が来なかった発話は履歴に残さない。
        persist(history, get().consolidatedCount)
        set({ messages: history, status: 'error', error: failureLine('chat').text })
        return false
      }
    },

    appendCameraLine: (content, emotion) => {
      const text = content.trim()
      if (!text) return
      const next = [...get().messages, createMessage('fairy', text, { emotion, origin: 'camera' })]
      const trimmed = trimMessages(next, get().consolidatedCount)
      persist(trimmed.messages, trimmed.consolidatedCount)
      set(trimmed)
      // 会話と同じ基準で要約を回す（カメラぶんは要約対象から外れるが、
      // 溜まった未要約の会話をここで流しておかないと切り詰めが進まない）。
      if (get().messages.length - get().consolidatedCount >= CONSOLIDATE_EVERY) {
        void runConsolidate()
      }
    },

    openConversation: async (personaId) => {
      // 要求済み・送信中なら何もしない（ホーム再マウントごとに叩かない）。
      if (get().openingRequested || get().status === 'sending') return
      const started = get().messages
      const lastAt = started.length > 0 ? started[started.length - 1].createdAt : null
      const reunion = reunionBucket(lastAt, new Date())
      // ついさっきまで話していたなら第一声は出さない（会話の続きをそのまま見せる）。
      if (reunion === null) return
      set({ openingRequested: true, opening: true })

      try {
        const context = await gatherChatContext()
        const gaugeFull = useGaugeStore.getState().value >= GAUGE_MAX
        const reply = await chatProvider.openConversation({
          personaId,
          ...context,
          gaugeFull,
          reunion,
        })

        // 生成中にユーザーが先に話し始めていたら、第一声は捨てる（会話に割り込まない）。
        if (get().messages.length === started.length) {
          const next = [...get().messages, createMessage('fairy', reply.text, { emotion: reply.emotion, voiceDirection: reply.voiceDirection })]
          const trimmed = trimMessages(next, get().consolidatedCount)
          persist(trimmed.messages, trimmed.consolidatedCount)
          set((s) => ({ ...trimmed, replyNonce: s.replyNonce + 1 }))
        }
      } catch {
        // 第一声はベストエフォート＝失敗してもホームの固定挨拶が出るだけ（エラー表示しない）。
      } finally {
        set({ opening: false })
      }
    },

    consolidateMemoryNow: runConsolidate,

    clearError: () => {
      if (get().error === null) return
      set({ error: null, status: get().status === 'error' ? 'idle' : get().status })
    },

    debugAgeHistory: (hours) => {
      const shifted = get().messages.map((m) => ({
        ...m,
        createdAt: new Date(new Date(m.createdAt).getTime() - hours * 3_600_000).toISOString(),
      }))
      persist(shifted, get().consolidatedCount)
      // 第一声はマウント時にしか走らないので、リロードして再訪の見え方を確かめる。
      set({ messages: shifted, openingRequested: false })
    },

    reset: () => {
      persist([], 0)
      set({
        messages: [],
        status: 'idle',
        error: null,
        opening: false,
        openingRequested: false,
        replyNonce: 0,
        consolidatedCount: 0,
      })
    },
  }
})
