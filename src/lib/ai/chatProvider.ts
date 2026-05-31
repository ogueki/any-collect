import type { ChatMessage } from '../../types'

/**
 * 会話プロバイダの抽象。
 * 実装（ClaudeChatProvider）は STEP2 で追加。API キーは /api/chat 側に置く。
 * いずれの実装も、選択中キャラの persona 定義を参照して口調を統一する。
 */
export interface ChatProvider {
  /** 会話履歴とユーザー入力から、妖精としての応答テキストを返す */
  sendMessage(
    history: ChatMessage[],
    userInput: string,
    opts?: { personaId?: string },
  ): Promise<string>
}
