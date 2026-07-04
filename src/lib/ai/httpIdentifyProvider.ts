import type { IdentifiedSubject, IdentifyProvider, IdentifyResult } from './identifyProvider'
import { FAIRY_EXPRESSIONS, type FairyExpression } from '../character/CharacterRenderer'
import { toCategory } from '../category'

/**
 * /api/identify プロキシ経由で図鑑判定を得る IdentifyProvider 実装。
 * どのモデルを使うかはサーバ側の責務で、クライアントは知らない（claude.md 原則1・2）。
 * サーバでも正規化しているが、表示を壊さないようクライアント側でも値を検証する。
 */

interface IdentifyApiResponse {
  comment?: string
  emotion?: string
  subject?: {
    name?: string
    speciesKey?: string
    description?: string
    category?: string
    bbox?: unknown
  } | null
  error?: string
}

/** API が返した emotion を既知の表情だけに絞る（不正/欠落は undefined）。 */
function toFairyExpression(value: unknown): FairyExpression | undefined {
  return typeof value === 'string' && (FAIRY_EXPRESSIONS as readonly string[]).includes(value)
    ? (value as FairyExpression)
    : undefined
}

/** 4 要素の有限数値配列なら bbox として受け取る（それ以外は null）。 */
function toBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null
  const nums = value.map((n) => Number(n))
  return nums.every((n) => Number.isFinite(n)) ? [nums[0], nums[1], nums[2], nums[3]] : null
}

/** raw な subject を検証して IdentifiedSubject | null に正規化する。 */
function toSubject(raw: IdentifyApiResponse['subject']): IdentifiedSubject | null {
  if (!raw) return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const speciesKey = typeof raw.speciesKey === 'string' ? raw.speciesKey.trim().toLowerCase() : ''
  const bbox = toBbox(raw.bbox)
  if (!name || !speciesKey || !bbox) return null
  return {
    name,
    speciesKey,
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    category: toCategory(raw.category),
    bbox,
  }
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

export const httpIdentifyProvider: IdentifyProvider = {
  async identify(photo, opts): Promise<IdentifyResult> {
    const image = await blobToDataUrl(photo)
    const res = await fetch('/api/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, personaId: opts?.personaId ?? 'default' }),
    })

    const data: IdentifyApiResponse = await res.json().catch(() => ({}))
    if (!res.ok || !data.comment) {
      throw new Error(data.error ?? `写真の判定に失敗しました (${res.status})`)
    }
    return {
      comment: data.comment,
      emotion: toFairyExpression(data.emotion),
      subject: toSubject(data.subject),
    }
  },
}
