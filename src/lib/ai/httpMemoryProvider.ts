import type { MemoryProvider } from './memoryProvider'
import type { MemoryFact } from '../../types'

/**
 * /api/memory プロキシ経由で記憶を更新する MemoryProvider 実装。
 * どのモデルを使うかはサーバ側 (api/memory.ts) の責務（claude.md 原則1・2）。
 */

interface MemoryApiResponse {
  facts?: unknown
  error?: string
}

/** wire 越しの facts を検証して MemoryFact[] に正規化する（最大12・空は捨てる）。 */
function toFacts(raw: unknown): MemoryFact[] {
  if (!Array.isArray(raw)) return []
  const out: MemoryFact[] = []
  for (const f of raw) {
    if (f && typeof f === 'object') {
      const rec = f as Record<string, unknown>
      const key = typeof rec.key === 'string' ? rec.key.trim() : ''
      const value = typeof rec.value === 'string' ? rec.value.trim() : ''
      if (key && value) out.push({ key, value })
    }
  }
  return out.slice(0, 12)
}

export const httpMemoryProvider: MemoryProvider = {
  async consolidate(messages, currentFacts) {
    const res = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        facts: currentFacts,
      }),
    })

    const data: MemoryApiResponse = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error ?? `記憶の更新に失敗しました (${res.status})`)
    }
    return toFacts(data.facts)
  },
}
