import type { GeneratedItem, ImageGenProvider } from './imageProvider'
import { toCategory } from '../category'

/**
 * /api/generate-item プロキシ経由でアイテムを生成する ImageGenProvider 実装。
 * どの画像モデル（Gemini 等）を使うかはサーバ側 (api/generate-item.ts) の責務であり、
 * クライアントはモデルを一切知らない（claude.md 原則1・2）。
 */

interface GenerateItemApiResponse {
  imageUrl?: string
  name?: string
  description?: string
  category?: string
  rarity?: GeneratedItem['rarity']
  error?: string
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

export const httpImageGenProvider: ImageGenProvider = {
  async generateItem(photo, opts) {
    const image = await blobToDataUrl(photo)
    const res = await fetch('/api/generate-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, personaId: opts?.personaId ?? 'default' }),
    })

    const data: GenerateItemApiResponse = await res.json().catch(() => ({}))
    if (!res.ok || !data.imageUrl || !data.name || !data.description) {
      throw new Error(data.error ?? `アイテム生成に失敗しました (${res.status})`)
    }

    return {
      imageUrl: data.imageUrl,
      name: data.name,
      description: data.description,
      // wire 越しは生 string なので既知キーに正規化（旧/想定外の値は other に倒す）。
      category: toCategory(data.category),
      rarity: data.rarity,
    }
  },

  async synthesize(a, b, opts) {
    const res = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemA: { imageUrl: a.imageUrl, name: a.name, description: a.description ?? '' },
        itemB: { imageUrl: b.imageUrl, name: b.name, description: b.description ?? '' },
        personaId: opts?.personaId ?? 'default',
      }),
    })

    const data: GenerateItemApiResponse = await res.json().catch(() => ({}))
    if (!res.ok || !data.imageUrl || !data.name || !data.description) {
      throw new Error(data.error ?? `アイテム合成に失敗しました (${res.status})`)
    }

    return {
      imageUrl: data.imageUrl,
      name: data.name,
      description: data.description,
      // wire 越しは生 string なので既知キーに正規化（旧/想定外の値は other に倒す）。
      category: toCategory(data.category),
      rarity: data.rarity,
    }
  },
}
