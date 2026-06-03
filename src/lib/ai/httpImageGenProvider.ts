import type { GeneratedItem, ImageGenProvider } from './imageProvider'

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
      category: data.category,
      rarity: data.rarity,
    }
  },

  // 合成（妖精の窯）は STEP7 で実装する。IF を満たすためのプレースホルダ。
  async synthesize() {
    throw new Error('アイテム合成（妖精の窯）は STEP7 で実装予定です')
  },
}
