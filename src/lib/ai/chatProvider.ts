import type { ChatMessage, MemoryFact, ReunionBucket } from '../../types'
import type { FairyExpression } from '../character/CharacterRenderer'

/** 妖精の返事。テキストに加え、立ち絵の表情に使う感情を伴う。 */
export interface ChatReply {
  text: string
  /** モデルが選んだ感情。未取得/不正なら undefined（表示側で neutral 等にフォールバック） */
  emotion?: FairyExpression
}

/** 会話に載せる接地オプション（好感度・記憶・図鑑/アルバム傾向・時間帯）。 */
export interface ChatOpts {
  personaId?: string
  affinityLevel?: number
  memoryFacts?: MemoryFact[]
  groundingNotes?: string[]
  /** いまの時間帯（朝/昼/夕方/夜/深夜）。クライアントの現地時刻から */
  timeOfDay?: string
}

/**
 * 会話プロバイダの抽象。
 * 実装（httpChatProvider, Gemini 経由）は STEP2 で追加済み。将来 Claude へはサーバ側 (api/chat.ts) で切替。API キーは /api/chat 側に置く。
 * いずれの実装も、選択中キャラの persona 定義を参照して口調を統一する。
 */
export interface ChatProvider {
  /** 会話履歴とユーザー入力から、妖精としての応答（テキスト＋感情）を返す */
  sendMessage(history: ChatMessage[], userInput: string, opts?: ChatOpts): Promise<ChatReply>
  /** 会話の始まりに、コレットからの第一声を生成する（ホームを開いたとき等） */
  openConversation(
    opts?: ChatOpts & { gaugeFull?: boolean; reunion?: ReunionBucket },
  ): Promise<ChatReply>
}
