import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import { sceneProvider } from '../../lib/ai/scene'
import { useAlbumStore } from '../../store/albumStore'

/**
 * カメラモード（v2）。「見せる → 反応 → アルバム保存」の最短ループ。
 * スキャンして即アイテム化はしない（アイテム化はホームの窯／ゲージ配給）。
 *
 * 撮影フレームを describeScene に渡してコレットのひとこと＋感情を取り、
 * 妖精がリアクションしたうえで写真をアルバムに保存する（§4.1）。
 * 写真はユーザーの思い出として保存する（v1 での方針転換・§9）。
 * テキスト先行で反応を出す（音声＝動的TTSは STEP3）。反応取得に失敗しても写真は保存する。
 */

// 送信画像が大きすぎないよう、撮影フレームの長辺をこのサイズに縮小する。
const MAX_DIMENSION = 1024

/**
 * 利用可能なら getUserMedia を返す（無ければ undefined）。
 * DOM の型上 navigator.mediaDevices は常在扱いだが、実際は非セキュアコンテキストや
 * 旧ブラウザで undefined になりうるため、明示的に「あるかも」型にして実行時判定を正当化する。
 */
type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>
function getCameraApi(): GetUserMedia | undefined {
  const md = navigator.mediaDevices as MediaDevices | undefined
  if (!md || typeof md.getUserMedia !== 'function') return undefined
  return md.getUserMedia.bind(md)
}

/** video の現在フレームを長辺 MAX_DIMENSION 以内に縮小して JPEG Blob 化する。 */
function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const { videoWidth: w, videoHeight: h } = video
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('canvas を初期化できませんでした'))
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('画像の取り出しに失敗しました'))),
      'image/jpeg',
      0.85,
    )
  })
}

export default function CameraMode() {
  const characterId = useAppStore((s) => s.characterId)
  const addPhoto = useAlbumStore((s) => s.add)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // カメラ可否は環境で静的に決まるので初期描画時に判定（effect 内 setState を避ける）。
  const [cameraError, setCameraError] = useState<string | null>(() =>
    getCameraApi() ? null : 'このブラウザ/環境ではカメラを利用できません',
  )
  // 撮影→反応→保存の実行中フラグ。
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 直近の撮影に対するコレットのひとこと（吹き出し・数秒で消える）。
  const [comment, setComment] = useState<string | null>(null)
  // 保存直後だけ出す「アルバムに保存したよ」フィードバック。
  const [savedFlash, setSavedFlash] = useState(false)
  // 撮影に対する妖精の一時リアクション（数秒でベース表情へ戻る）。共有フックに集約。
  const { expression: reactionExpression, animateKey, fire: fireReaction } = useFairyReaction()

  // マウント時にライブカメラを開始（背面カメラ優先）。アンマウントで停止。
  useEffect(() => {
    let active = true
    const getUserMedia = getCameraApi()
    if (!getUserMedia) return // 可否は初期 state で判定済み
    getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => {})
        }
      })
      .catch(() => {
        if (active) setCameraError('カメラを起動できませんでした（権限を確認してね）')
      })

    return () => {
      active = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  // 撮る → コレットがひとこと反応 → 写真をアルバムに保存する（カメラの主ループ）。
  const handleCapture = useCallback(async () => {
    const video = videoRef.current
    if (!video || busy) return
    setBusy(true)
    setError(null)
    setComment(null)
    fireReaction('thinking') // 「見てるね…」の即時フィードバック
    try {
      const photo = await captureFrame(video)
      // テキスト先行：反応（ひとこと＋感情）を取りに行く。演出なので失敗しても写真は残す。
      let commentText: string | undefined
      let emotion: FairyExpression | undefined
      try {
        const reaction = await sceneProvider.describeScene(photo, { personaId: characterId })
        commentText = reaction.comment
        emotion = reaction.emotion
        setComment(reaction.comment)
        fireReaction(reaction.emotion ?? 'happy')
      } catch {
        // 反応取得失敗＝コレットは黙って受け取る（写真の保存は続ける）。
        fireReaction('happy')
      }
      await addPhoto({ blob: photo, comment: commentText, emotion })
      setSavedFlash(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setBusy(false)
    }
  }, [busy, characterId, fireReaction, addPhoto])

  // 「保存したよ」表示は数秒で自然に消す。
  useEffect(() => {
    if (!savedFlash) return
    const timer = setTimeout(() => setSavedFlash(false), 2000)
    return () => clearTimeout(timer)
  }, [savedFlash])

  // ひとことの吹き出しは数秒で自然に消す。
  useEffect(() => {
    if (!comment) return
    const timer = setTimeout(() => setComment(null), 6000)
    return () => clearTimeout(timer)
  }, [comment])

  // ベース表情（状態由来）。リアクション中はそれを一時的に上書きする。
  const baseExpression: FairyExpression = busy ? 'thinking' : cameraError ? 'sad' : 'neutral'
  const expression = reactionExpression ?? baseExpression

  return (
    <div className="relative flex h-full flex-col bg-slate-900 text-white">
      {/* ライブビュー */}
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

      {/* カメラ不可時のフォールバック */}
      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90 px-6 text-center">
          <h1 className="font-display text-2xl font-bold text-mint">カメラモード</h1>
          <p className="max-w-xs text-sm text-slate-300">{cameraError}</p>
        </div>
      )}

      {/* 撮影ボタン */}
      {!cameraError && (
        <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2">
          {savedFlash && (
            <p className="rounded-full bg-mint/90 px-4 py-1 text-sm font-bold text-slate-900 shadow-pop">
              ✓ アルバムに保存したよ
            </p>
          )}
          {error && (
            <p className="rounded-full bg-slate-900/80 px-3 py-1 text-xs text-peach">{error}</p>
          )}
          <button
            type="button"
            onClick={() => void handleCapture()}
            disabled={busy}
            aria-label="撮ってコレットに見せる"
            className="h-20 w-20 rounded-full border-4 border-white bg-mint p-1 shadow-pop transition active:scale-95 disabled:opacity-50"
          >
            <span className="block h-full w-full rounded-full bg-mint ring-2 ring-slate-900/10" />
          </button>
        </div>
      )}

      {/* 妖精は画面右下に小さく。撮影に反応してひとことを返す。 */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1">
        {comment && (
          <div className="max-w-[60vw] rounded-2xl rounded-br-sm bg-white/95 px-3 py-1.5 text-right text-xs text-slate-700 shadow-pop">
            {comment}
          </div>
        )}
        <Sprite2DRenderer
          characterId={characterId}
          expression={expression}
          size="sm"
          animateKey={animateKey}
        />
      </div>
    </div>
  )
}
