import type { ChatProvider } from './chatProvider'
import { httpChatProvider } from './httpChatProvider'

/**
 * アプリ全体で使う会話プロバイダ。実装の差し替えはこの1箇所で行う。
 * （サーバ側 api/chat.ts が Gemini→Claude を切り替える前提なので、
 *  通常はクライアント側を触る必要はない。）
 */
export const chatProvider: ChatProvider = httpChatProvider
