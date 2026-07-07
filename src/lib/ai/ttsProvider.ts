/**
 * 音声合成プロバイダの抽象。
 * 実装（httpTtsProvider＝/api/tts→Fish Audio）は STEP3 で追加。API キーは /api/tts 側に置く。
 * どの声を使うかはサーバ側（voice.json）が決めるため、クライアントは personaId だけ渡す。
 */
export interface TtsProvider {
  /** テキストを音声化し、再生用の音声 Blob を返す */
  synthesizeSpeech(text: string, opts?: { personaId?: string }): Promise<Blob>
}
