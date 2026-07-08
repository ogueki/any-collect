/**
 * 音声合成プロバイダの抽象。
 * 実装（httpTtsProvider＝/api/tts→Fish Audio）は STEP3 で追加。API キーは /api/tts 側に置く。
 * どの声を使うかはサーバ側（voice.json）が決めるため、クライアントは personaId だけ渡す。
 */
export interface TtsProvider {
  /** テキストを音声化し、再生用の音声 Blob を返す（全生成を待つフォールバック経路）。 */
  synthesizeSpeech(text: string, opts?: { personaId?: string }): Promise<Blob>
  /**
   * 音声を「生成しながら」ストリーミングで取得する（低レイテンシ経路・任意）。
   * 呼び出し側は `Response.body`（ReadableStream）を逐次再生に流し込む。
   * 実装が無い／環境が MediaSource 非対応なら `synthesizeSpeech`（Blob）へフォールバックする。
   */
  synthesizeSpeechStream?(text: string, opts?: { personaId?: string }): Promise<Response>
}
