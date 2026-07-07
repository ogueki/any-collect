import type { TtsProvider } from './ttsProvider'

/**
 * /api/tts プロキシ経由で音声合成する TtsProvider 実装（Fish Audio）。
 * どのサービス/声を使うかはサーバ側（api/tts.ts＋voice.json）の責務で、
 * クライアントは知らない（claude.md 原則1・2）。返りは再生用の音声 Blob。
 */
export const httpTtsProvider: TtsProvider = {
  async synthesizeSpeech(text, opts) {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, personaId: opts?.personaId ?? 'default' }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(data.error ?? `音声合成に失敗しました (${res.status})`)
    }
    return await res.blob()
  },
}
