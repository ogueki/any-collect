import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import { imageGenProvider } from '../../lib/ai/imageGen'
import type { GeneratedItem } from '../../lib/ai/imageProvider'
import { useCodexStore } from '../../store/codexStore'
import { RARITY_CLASS, RARITY_LABEL } from '../../lib/rarity'
import { emotionForConfirm, emotionForGenerated } from '../../lib/character/reaction'

/**
 * カメラモード（STEP3）。
 * ライブ撮影 → AI アイテム化 → 結果プレビュー（→ リロール）の最短ループ。
 * 目的は「絵柄の統一感」を実際に何枚か生成して目視で詰めること。
 *
 * リロール: 気に入らなければ「同じ元写真」から作り直す（spec.md「元写真はこの間だけ保持」）。
 * 元写真は撮影〜プレビュー中だけ capturedPhotoRef にメモリ保持し、
 * 「もう一回撮る」/確定/アンマウントで明示破棄する（永続保存はしない＝プライバシー方針）。
 * 確定（図鑑にしまう）で codexStore 経由で永続化し、元写真を破棄してライブに戻る（STEP4a）。
 */

// 生成画像が大きすぎないよう、撮影フレームの長辺をこのサイズに縮小してから送る。
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
  const addToCodex = useCodexStore((s) => s.addFromGenerated)
  const isNewCategory = useCodexStore((s) => s.isNewCategory)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // 撮影フレームをプレビュー〜リロールの間だけメモリ保持する（永続保存しない）。
  const capturedPhotoRef = useRef<Blob | null>(null)

  // カメラ可否は環境で静的に決まるので初期描画時に判定（effect 内 setState を避ける）。
  const [cameraError, setCameraError] = useState<string | null>(() =>
    getCameraApi() ? null : 'このブラウザ/環境ではカメラを利用できません',
  )
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [result, setResult] = useState<GeneratedItem | null>(null)
  const [saving, setSaving] = useState(false)
  // 確定後にライブへ戻った直後だけ出す「しまったよ」フィードバック。
  const [savedFlash, setSavedFlash] = useState(false)
  // 収集体験に対する妖精の一時リアクション（数秒で消えてベース表情へ戻る）。共有フックに集約。
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

  // アンマウント時に保持中の元写真を明示破棄する（プライバシー方針）。
  useEffect(
    () => () => {
      capturedPhotoRef.current = null
    },
    [],
  )

  // 保持した元写真からアイテムを生成する。撮影直後とリロールで共有する。
  const generateFrom = useCallback(
    async (photo: Blob) => {
      if (generating) return
      setGenerating(true)
      setGenError(null)
      try {
        const item = await imageGenProvider.generateItem(photo, { personaId: characterId })
        setResult(item)
        // 生成成功＝最初のリビール。レア度に応じて妖精が喜ぶ／驚く。
        fireReaction(emotionForGenerated(item))
      } catch (err) {
        setGenError(err instanceof Error ? err.message : 'アイテム化に失敗しました')
      } finally {
        setGenerating(false)
      }
    },
    [characterId, generating, fireReaction],
  )

  const handleCapture = useCallback(async () => {
    const video = videoRef.current
    if (!video || generating) return
    let photo: Blob
    try {
      photo = await captureFrame(video)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : '画像の取り出しに失敗しました')
      return
    }
    capturedPhotoRef.current = photo
    await generateFrom(photo)
  }, [generating, generateFrom])

  // リロール: 同じ元写真から作り直す（新しく撮り直さない）。
  const handleReroll = useCallback(() => {
    const photo = capturedPhotoRef.current
    if (!photo || generating) return
    void generateFrom(photo)
  }, [generating, generateFrom])

  // もう一回撮る: 保持中の元写真を破棄してライブに戻る。
  const handleRetry = useCallback(() => {
    capturedPhotoRef.current = null
    setResult(null)
    setGenError(null)
  }, [])

  // 図鑑にしまう: 生成結果を永続化し、元写真を破棄してライブに戻る（連続撮影できる）。
  const handleConfirm = useCallback(async () => {
    if (!result || saving) return
    setSaving(true)
    setGenError(null)
    try {
      // 登録前に判定（addToCodex で items に積まれる前でないと常に false になる）。
      const isNew = isNewCategory(result.category)
      await addToCodex(result)
      // 確定したので元写真を破棄（spec.md「確定すると元写真は破棄」）。
      capturedPhotoRef.current = null
      setResult(null)
      setSavedFlash(true)
      // 新カテゴリ初取得なら大興奮、それ以外は素直に喜ぶ（ライブ戻り後の右下妖精に出る）。
      fireReaction(emotionForConfirm(isNew))
    } catch (err) {
      setGenError(err instanceof Error ? err.message : '図鑑への登録に失敗しました')
    } finally {
      setSaving(false)
    }
  }, [result, saving, addToCodex, isNewCategory, fireReaction])

  // 「しまったよ」表示は数秒で自然に消す。
  useEffect(() => {
    if (!savedFlash) return
    const timer = setTimeout(() => setSavedFlash(false), 2000)
    return () => clearTimeout(timer)
  }, [savedFlash])

  // ベース表情（状態由来）。リアクション中はそれを一時的に上書きする。
  const baseExpression: FairyExpression = generating
    ? 'thinking'
    : result
      ? 'happy'
      : cameraError
        ? 'sad'
        : 'neutral'
  const expression = reactionExpression ?? baseExpression

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
          <Sprite2DRenderer characterId={characterId} expression="searching" size="lg" />
          <p className="animate-pulse font-display text-lg text-mint">鑑定中…</p>
        </div>
      )}

      {/* 生成結果プレビュー */}
      {result && !generating && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/85 px-6 text-center">
          {/* リビールに合わせて妖精がリアクション（レア度で喜ぶ／驚く） */}
          <Sprite2DRenderer
            characterId={characterId}
            expression={expression}
            size="sm"
            animateKey={animateKey}
          />
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
          {genError && (
            <p className="rounded-full bg-slate-900/80 px-3 py-1 text-xs text-peach">{genError}</p>
          )}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={saving}
              className="rounded-full bg-mint px-8 py-2.5 font-bold text-slate-900 shadow-pop transition active:scale-95 disabled:opacity-50"
            >
              {saving ? '登録中…' : '図鑑にしまう'}
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReroll}
                disabled={saving}
                className="rounded-full border border-white/40 px-6 py-2 font-bold text-white transition active:scale-95 disabled:opacity-50"
              >
                描き直す
              </button>
              <button
                type="button"
                onClick={handleRetry}
                disabled={saving}
                className="rounded-full border border-white/40 px-6 py-2 font-bold text-white transition active:scale-95 disabled:opacity-50"
              >
                もう一回撮る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 撮影ボタン（ライブ表示中のみ） */}
      {!cameraError && !result && (
        <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2">
          {savedFlash && (
            <p className="rounded-full bg-mint/90 px-4 py-1 text-sm font-bold text-slate-900 shadow-pop">
              ✓ 図鑑にしまったよ
            </p>
          )}
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
