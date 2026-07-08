import type { TtsProvider } from './ttsProvider'

/**
 * /api/tts プロキシ経由で音声合成する TtsProvider 実装（Fish Audio）。
 * どのサービス/声を使うかはサーバ側（api/tts.ts＋voice.json）の責務で、
 * クライアントは知らない（claude.md 原則1・2）。返りは再生用の音声 Blob。
 */
/** /api/tts を叩いて Response を得る（成否判定込み）。stream/blob 経路の共通部。 */
async function fetchTts(text: string, personaId?: string): Promise<Response> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, personaId: personaId ?? 'default' }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `音声合成に失敗しました (${res.status})`)
  }
  return res
}

export const httpTtsProvider: TtsProvider = {
  async synthesizeSpeech(text, opts) {
    const res = await fetchTts(text, opts?.personaId)
    return await res.blob()
  },
  // 低レイテンシ経路：Response をそのまま返し、呼び出し側が body を逐次再生に流す。
  async synthesizeSpeechStream(text, opts) {
    return await fetchTts(text, opts?.personaId)
  },
}
