import { ttsProvider } from '../ai/tts'
import { useAppStore } from '../../store/appStore'

/**
 * 妖精の声を鳴らす共有ユーティリティ（STEP3・動的TTS）。
 * ttsProvider（/api/tts→Fish）で音声を得て、ひとつの永続 <audio> で再生する。
 * ON/OFF は `appStore.voiceEnabled` でゲート。カメラ反応の自動読み上げと
 * 会話の 🔊 タップ再生で共用する（各画面は `speak(text)` を呼ぶだけ）。
 *
 * 設計の要点：
 * - **単一の永続 Audio 要素を使い回す**。`primeAudio()` がユーザー操作の中でこの要素を一度
 *   アンロックすれば、以後は非同期（identify 完了後など操作から時間が経った再生）でも
 *   `src` を差し替えて鳴らせる＝カメラ初回・放置後の無音バグを解消（自動再生ポリシー対策）。
 * - 対応環境では **MediaSource で最初のチャンクから逐次再生**（低レイテンシ）。
 *   非対応（例：Safari の mp3×MSE 不可）では **Blob 全バッファ**へ自動フォールバック。
 */

const MIME = 'audio/mpeg'

// アプリ全体で 1 個だけ使い回す <audio>。一度アンロックすればページ寿命の間ずっと再生できる。
let player: HTMLAudioElement | null = null
// 現在の src に紐づく object URL（Blob / MediaSource）。差し替え時に解放する。
let currentObjectUrl: string | null = null
/** 最後に要求した発話を優先するための世代カウンタ（生成の非同期レースを解消）。 */
let requestSeq = 0

/** ManagedMediaSource（iOS17.1+）優先で MediaSource コンストラクタを得る。無ければ null。 */
type MediaSourceCtor = typeof MediaSource
function getMediaSourceCtor(): MediaSourceCtor | null {
  const w = window as unknown as {
    ManagedMediaSource?: MediaSourceCtor
    MediaSource?: MediaSourceCtor
  }
  return w.ManagedMediaSource ?? w.MediaSource ?? null
}

function getPlayer(): HTMLAudioElement {
  if (!player) {
    const a = new Audio()
    a.preload = 'auto'
    // ManagedMediaSource 利用時にリモート再生の絡みを避ける（非対応ブラウザでは無害）。
    ;(a as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true
    player = a
  }
  return player
}

function revokeUrl(): void {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

/** 再生中の音声を止めて後始末する。永続要素自体は破棄しない（アンロック状態を保つ）。 */
export function stopSpeaking(): void {
  if (player) player.pause()
  revokeUrl()
}

/** SourceBuffer にチャンクを追記し、updateend まで待つ（更新中の多重 append を避ける）。 */
function appendChunk(sb: SourceBuffer, chunk: BufferSource): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      sb.removeEventListener('updateend', done)
      sb.removeEventListener('error', fail)
      resolve()
    }
    const fail = () => {
      sb.removeEventListener('updateend', done)
      sb.removeEventListener('error', fail)
      reject(new Error('sourcebuffer append error'))
    }
    sb.addEventListener('updateend', done)
    sb.addEventListener('error', fail)
    try {
      sb.appendBuffer(chunk)
    } catch (e) {
      sb.removeEventListener('updateend', done)
      sb.removeEventListener('error', fail)
      reject(e)
    }
  })
}

/** 低レイテンシ経路：ストリームを MediaSource に流し込み、最初のチャンクで再生開始。 */
async function speakStreaming(text: string, myReq: number, MS: MediaSourceCtor): Promise<void> {
  const res = await ttsProvider.synthesizeSpeechStream!(text)
  if (myReq !== requestSeq) return
  const body = res.body
  if (!body) {
    // ストリームが取れないなら同じ応答を Blob 化して従来再生。
    await playBlob(await res.blob(), myReq)
    return
  }

  const p = getPlayer()
  p.muted = false
  const mediaSource = new MS()
  const url = URL.createObjectURL(mediaSource)
  currentObjectUrl = url
  p.src = url

  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      mediaSource.removeEventListener('sourceopen', onOpen)
      void (async () => {
        try {
          const sb = mediaSource.addSourceBuffer(MIME)
          const reader = body.getReader()
          let started = false
          for (;;) {
            if (myReq !== requestSeq) {
              await reader.cancel().catch(() => {})
              break
            }
            const { done, value } = await reader.read()
            if (done) break
            if (value && value.length > 0) {
              // 独立した ArrayBuffer backing にコピー（reader の Uint8Array は ArrayBufferLike で
              // BufferSource へ直接渡せないため）。チャンクは小さくコストは無視できる。
              await appendChunk(sb, new Uint8Array(value))
              if (!started) {
                started = true
                void p.play().catch(() => {})
              }
            }
          }
          if (myReq === requestSeq && mediaSource.readyState === 'open') {
            try {
              mediaSource.endOfStream()
            } catch {
              // 既に閉じている等は無視。
            }
          }
          resolve()
        } catch (e) {
          reject(e)
        }
      })()
    }
    mediaSource.addEventListener('sourceopen', onOpen)
  })
}

/** フォールバック経路：全バッファの Blob を作ってから再生。 */
async function speakBuffered(text: string, myReq: number): Promise<void> {
  const blob = await ttsProvider.synthesizeSpeech(text)
  if (myReq !== requestSeq) return
  await playBlob(blob, myReq)
}

/** Blob を永続要素にセットして再生する。 */
async function playBlob(blob: Blob, myReq: number): Promise<void> {
  if (myReq !== requestSeq) return
  const url = URL.createObjectURL(blob)
  currentObjectUrl = url
  const p = getPlayer()
  p.muted = false
  p.src = url
  await p.play().catch(() => {})
}

/**
 * text を音声化して再生する。`voiceEnabled` が false なら何もしない。
 * 直前の再生は停止（重ならない）。生成失敗・再生ブロックは黙って諦める
 * ＝声はベストエフォート（本文はテキストで既に出ている）。
 */
export async function speak(text: string): Promise<void> {
  const t = text.trim()
  if (!t) return
  if (!useAppStore.getState().voiceEnabled) return

  const myReq = ++requestSeq
  stopSpeaking()

  const MS = getMediaSourceCtor()
  const canStream =
    !!MS &&
    typeof ttsProvider.synthesizeSpeechStream === 'function' &&
    typeof MS.isTypeSupported === 'function' &&
    MS.isTypeSupported(MIME)

  try {
    if (canStream) {
      await speakStreaming(t, myReq, MS as MediaSourceCtor)
    } else {
      await speakBuffered(t, myReq)
    }
  } catch {
    if (myReq === requestSeq) revokeUrl()
  }
}

/**
 * iOS/モバイルの自動再生アンロック。ユーザー操作（撮影/送信/声ON タップ）の中で1回呼ぶと、
 * 永続要素が「操作起点で再生された」状態になり、後続の非同期 `play()`（src 差し替え）が通る。
 * 44byte の無音 WAV を一瞬鳴らすだけ（冪等・無音・アンミュートで再生＝これがアンロックの条件）。
 */
let primed = false
export function primeAudio(): void {
  if (primed) return
  primed = true
  try {
    const p = getPlayer()
    p.muted = false
    p.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
    void p
      .play()
      .then(() => {
        p.pause()
        p.currentTime = 0
      })
      .catch(() => {
        // アンロックできなくても致命ではない（直接タップ再生は gesture 内なので確実）。
      })
  } catch {
    // 要素生成に失敗しても声はベストエフォート。
  }
}
