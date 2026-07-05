import type { ChatMessage, MemoryFact } from '../../types'

/**
 * 記憶の抽象（v2・STEP2b）。会話から「相手についての短い事実」を抽出/更新する。
 * 実装（httpMemoryProvider, Gemini 経由）はサーバ側 /api/memory を叩く薄いラッパ。
 * scene/identify のプロバイダと同じ「単一差し替え点」パターン（claude.md 原則2）。
 */
export interface MemoryProvider {
  /**
   * 直近の会話＋現在の facts を渡し、更新後の全 facts（最大~12）を返す。
   * 更新は「既存を踏まえた全リスト置換」（サーバ側で統合・重複排除する）。
   */
  consolidate(messages: ChatMessage[], currentFacts: MemoryFact[]): Promise<MemoryFact[]>
}
