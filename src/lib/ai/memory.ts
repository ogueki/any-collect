import type { MemoryProvider } from './memoryProvider'
import { httpMemoryProvider } from './httpMemoryProvider'

/**
 * アプリ全体で使う記憶プロバイダ。実装の差し替えはこの1箇所で行う
 * （chat/scene/identify と同じ単一差し替え点パターン）。
 */
export const memoryProvider: MemoryProvider = httpMemoryProvider
