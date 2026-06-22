import type { SceneProvider } from './sceneProvider'
import { httpSceneProvider } from './httpSceneProvider'

/**
 * アプリ全体で使う風景コメントプロバイダ。実装の差し替えはこの1箇所で行う
 * （`chat.ts` / `imageGen.ts` と同じ単一差し替え点パターン）。
 */
export const sceneProvider: SceneProvider = httpSceneProvider
