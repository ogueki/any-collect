import type { IdentifyProvider } from './identifyProvider'
import { httpIdentifyProvider } from './httpIdentifyProvider'

/**
 * アプリ全体で使う図鑑判定プロバイダ。実装の差し替えはこの1箇所で行う
 * （`chat.ts` / `imageGen.ts` / `scene.ts` と同じ単一差し替え点パターン）。
 */
export const identifyProvider: IdentifyProvider = httpIdentifyProvider
