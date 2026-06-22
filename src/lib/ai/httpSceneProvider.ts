import type { SceneProvider } from './sceneProvider'
import { FAIRY_EXPRESSIONS, type FairyExpression } from '../character/CharacterRenderer'

/**
 * /api/describe-scene プロキシ経由で風景コメントを得る SceneProvider 実装。
 * どのモデルを使うかはサーバ側の責務で、クライアントは知らない（claude.md 原則1・2）。
 */

interface DescribeSceneApiResponse {
  comment?: string
  emotion?: string
  error?: string
}

/** API が返した emotion を既知の表情だけに絞る（不正/欠落は undefined）。 */
function toFairyExpression(value: unknown): FairyExpression | undefined {
  return typeof value === 'string' && (FAIRY_EXPRESSIONS as readonly string[]).includes(value)
    ? (value as FairyExpression)
    : undefined
}

/** Blob を data URL（'data:image/...;base64,...'）に変換する。 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('画像の読み込みに失敗しました'))
    reader.readAsDataURL(blob)
  })
}

export const httpSceneProvider: SceneProvider = {
  async describeScene(photo, opts) {
    const image = await blobToDataUrl(photo)
    const res = await fetch('/api/describe-scene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, personaId: opts?.personaId ?? 'default' }),
    })

    const data: DescribeSceneApiResponse = await res.json().catch(() => ({}))
    if (!res.ok || !data.comment) {
      throw new Error(data.error ?? `風景コメントに失敗しました (${res.status})`)
    }
    return { comment: data.comment, emotion: toFairyExpression(data.emotion) }
  },
}
