import { ttsProvider } from '../ai/tts'
import { useAppStore } from '../../store/appStore'

/**
 * 妖精の声を鳴らす共有ユーティリティ（STEP3・動的TTS）。
 * ttsProvider（/api/tts→Fish）で音声 Blob を得て HTMLAudioElement で再生する。
 * ON/OFF は `appStore.voiceEnabled` でゲート。カメラ反応の自動読み上げと
 * 会話の 🔊 タップ再生で共用する（低結合＝各画面は `speak(text)` を呼ぶだけ）。
 */

let currentAudio: HTMLAudioElement | null = null
let currentUrl: string | null = null
/** 最後に要求した発話を優先するための世代カウンタ（生成の非同期レースを解消）。 */
let requestSeq = 0

function cleanup(): void {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl)
    currentUrl = null
  }
  currentAudio = null
}

/** 再生中の音声を止めて後始末する。 */
export function stopSpeaking(): void {
  if (currentAudio) currentAudio.pause()
  cleanup()
}

/**
 * text を音声化して再生する。`voiceEnabled` が false なら何もしない。
 * 直前の再生は停止（重ならない）。生成失敗・再生ブロック（iOS 自動再生ポリシー）は
 * 黙って諦める＝声はベストエフォート（本文はテキストで既に出ている）。
 */
export async function speak(text: string): Promise<void> {
  const t = text.trim()
  if (!t) return
  if (!useAppStore.getState().voiceEnabled) return

  const myReq = ++requestSeq
  stopSpeaking()
  try {
    const blob = await ttsProvider.synthesizeSpeech(t)
    if (myReq !== requestSeq) return // 生成中に後発の要求に追い越された

    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    currentUrl = url
    audio.addEventListener('ended', () => {
      if (currentAudio === audio) cleanup()
    })
    await audio.play()
  } catch {
    cleanup()
  }
}

/**
 * iOS/モバイルの自動再生アンロック。ユーザー操作（撮影/送信タップ）の中で1回呼ぶと、
 * 後続の非同期 `play()` が通りやすくなる。極小の無音を一瞬鳴らすだけ（冪等）。
 */
let primed = false
export function primeAudio(): void {
  if (primed) return
  primed = true
  try {
    const a = new Audio()
    // 44 バイトの無音 WAV。
    a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
    a.volume = 0
    void a.play().catch(() => {})
  } catch {
    // アンロックできなくても致命ではない（会話の 🔊 タップは gesture 内なので確実）。
  }
}
