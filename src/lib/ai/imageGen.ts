import type { ImageGenProvider } from './imageProvider'
import { httpImageGenProvider } from './httpImageGenProvider'

/**
 * アプリ全体で使う画像生成プロバイダ。実装の差し替えはこの1箇所で行う。
 * （サーバ側 api/generate-item.ts が使用モデルを決める前提なので、
 *  通常はクライアント側を触る必要はない。）
 */
export const imageGenProvider: ImageGenProvider = httpImageGenProvider
