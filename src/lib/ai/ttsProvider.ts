/**
 * 音声合成プロバイダの抽象。
 * 実装（FishAudioTtsProvider）は STEP5 で追加。API キーは /api/tts 側に置く。
 */
export interface TtsProvider {
  /** テキストを音声化し、再生用の音声 Blob を返す */
  synthesizeSpeech(text: string, opts?: { voiceId?: string }): Promise<Blob>
}
