import type { TtsProvider } from './ttsProvider'
import { httpTtsProvider } from './httpTtsProvider'

/**
 * アプリ全体で使う音声合成プロバイダ。実装の差し替えはこの1箇所で行う
 * （`chat.ts` / `scene.ts` と同じ単一差し替え点パターン）。
 */
export const ttsProvider: TtsProvider = httpTtsProvider
