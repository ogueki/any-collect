import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import { imageGenProvider } from '../../lib/ai/imageGen'
import type { GeneratedItem } from '../../lib/ai/imageProvider'
import type { Rarity } from '../../types'

/**
 * カメラモード（STEP3 スパイク）。
 * ライブ撮影 → AI アイテム化 → 結果プレビュー の最短ループ。
 * 目的は「絵柄の統一感」を実際に何枚か生成して目視で詰めること。
 * リロール・確定/図鑑登録・元写真の明示破棄ハンドリングは後続 STEP で肉付けする
 * （現状は永続化しないので、生成後に元写真はメモリから自然に破棄される）。
 */

// 生成画像が大きすぎないよう、撮影フレームの長辺をこのサイズに縮小してから送る。
const MAX_DIMENSION = 1024

const RARITY_LABEL: Record<Rarity, string> = {
  common: 'コモン',
  uncommon: 'アンコモン',
  rare: 'レア',
  epic: 'エピック',
  legendary: 'レジェンダリー',
}

const RARITY_CLASS: Record<Rarity, string> = {
  common: 'bg-slate-200 text-slate-600',
  uncommon: 'bg-mint/30 text-emerald-700',
  rare: 'bg-sky-200 text-sky-700',
  epic: 'bg-lavender/40 text-violet-700',
  legendary: 'bg-lemon/60 text-amber-700',
}

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

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // カメラ可否は環境で静的に決まるので初期描画時に判定（effect 内 setState を避ける）。
  const [cameraError, setCameraError] = useState<string | null>(() =>
    getCameraApi() ? null : 'このブラウザ/環境ではカメラを利用できません',
  )
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [result, setResult] = useState<GeneratedItem | null>(null)

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

  const handleCapture = useCallback(async () => {
    const video = videoRef.current
    if (!video || generating) return
    setGenerating(true)
    setGenError(null)
    try {
      const photo = await captureFrame(video)
      const item = await imageGenProvider.generateItem(photo, { personaId: characterId })
      setResult(item)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'アイテム化に失敗しました')
    } finally {
      setGenerating(false)
    }
  }, [characterId, generating])

  const handleRetry = useCallback(() => {
    setResult(null)
    setGenError(null)
  }, [])

  const expression: FairyExpression = generating
    ? 'thinking'
    : result
      ? 'happy'
      : cameraError
        ? 'sad'
        : 'neutral'

  return (
    <div className="relative flex h-full flex-col bg-slate-900 text-white">
      {/* ライブビュー */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-cover"
      />

      {/* カメラ不可時のフォールバック */}
      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90 px-6 text-center">
          <h1 className="font-display text-2xl font-bold text-mint">カメラモード</h1>
          <p className="max-w-xs text-sm text-slate-300">{cameraError}</p>
        </div>
      )}

      {/* 鑑定中オーバーレイ */}
      {generating && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/70 backdrop-blur-sm">
          <Sprite2DRenderer characterId={characterId} expression="thinking" size="lg" />
          <p className="animate-pulse font-display text-lg text-mint">鑑定中…</p>
        </div>
      )}

      {/* 生成結果プレビュー */}
      {result && !generating && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/85 px-6 text-center">
          <div className="w-full max-w-xs rounded-3xl bg-white p-4 text-slate-800 shadow-pop">
            <img
              src={result.imageUrl}
              alt={result.name}
              className="mx-auto aspect-square w-full max-w-[15rem] rounded-2xl object-contain"
            />
            <div className="mt-3 flex items-center justify-center gap-2">
              <h2 className="font-display text-xl font-bold">{result.name}</h2>
              {result.rarity && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${RARITY_CLASS[result.rarity]}`}
                >
                  {RARITY_LABEL[result.rarity]}
                </span>
              )}
            </div>
            {result.category && (
              <p className="mt-0.5 text-xs text-slate-400">{result.category}</p>
            )}
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
              {result.description}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-full bg-mint px-6 py-2 font-bold text-slate-900 shadow-pop transition active:scale-95"
          >
            もう一回撮る
          </button>
        </div>
      )}

      {/* 撮影ボタン（ライブ表示中のみ） */}
      {!cameraError && !result && (
        <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2">
          {genError && (
            <p className="rounded-full bg-slate-900/80 px-3 py-1 text-xs text-peach">{genError}</p>
          )}
          <button
            type="button"
            onClick={() => void handleCapture()}
            disabled={generating}
            aria-label="撮ってアイテム化"
            className="h-20 w-20 rounded-full border-4 border-white bg-mint p-1 shadow-pop transition active:scale-95 disabled:opacity-50"
          >
            <span className="block h-full w-full rounded-full bg-mint ring-2 ring-slate-900/10" />
          </button>
        </div>
      )}

      {/* 妖精は画面右下に小さく */}
      <div className="absolute bottom-4 right-4">
        <Sprite2DRenderer characterId={characterId} expression={expression} size="sm" />
      </div>
    </div>
  )
}
