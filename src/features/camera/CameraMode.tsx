import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { FairyExpression } from '../../lib/character/CharacterRenderer'
import { useFairyReaction } from '../../lib/character/useFairyReaction'
import { identifyProvider } from '../../lib/ai/identify'
import { cropToBlob } from '../../lib/image/crop'
import { useAlbumStore } from '../../store/albumStore'
import { useCollectionStore } from '../../store/collectionStore'
import { useGaugeStore, GAUGE_PER_CAPTURE } from '../../store/gaugeStore'
import { useAffinityStore, AFFINITY_PER_CAPTURE, levelForScore } from '../../store/affinityStore'
import { speak, primeAudio } from '../../lib/audio/useSpeak'

/**
 * カメラモード（v2・STEP1d）。「見せる → 判定 → 図鑑に収集＋アルバムに思い出」の最短ループ。
 * スキャンして即・透過アイテム化はしない（アイテム化はホームの窯／ゲージ配給）。
 *
 * 撮影フレームを identify に渡し、コレットのひとこと＋感情＋写っている主役（bbox付き）を取る。
 * 主役が採れたら bbox でクロップして図鑑に収集（無料・無制限＝Seek 型）。同時に全体フレームを
 * アルバムに思い出として保存する（iNaturalist の「観察ログ×ライフリスト」二層／§4.1）。
 * テキスト先行 → 反応を動的TTS（Fish）で読み上げ（声は voiceEnabled でON/OFF）。判定に失敗しても写真は保存する。
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
  const voiceEnabled = useAppStore((s) => s.voiceEnabled)
  const toggleVoice = useAppStore((s) => s.toggleVoice)
  const go = useAppStore((s) => s.go)
  const addPhoto = useAlbumStore((s) => s.add)
  const collect = useCollectionStore((s) => s.collect)
  const updatePhoto = useCollectionStore((s) => s.updatePhoto)
  const addGauge = useGaugeStore((s) => s.add)
  const addAffinity = useAffinityStore((s) => s.add)
  const affinityLevel = useAffinityStore((s) => levelForScore(s.score))

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // カメラ可否は環境で静的に決まるので初期描画時に判定（effect 内 setState を避ける）。
  const [cameraError, setCameraError] = useState<string | null>(() =>
    getCameraApi() ? null : 'このブラウザ/環境ではカメラを利用できません',
  )
  // 撮影→判定→収集/保存の実行中フラグ。
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 直近の撮影に対するコレットのひとこと（吹き出し・数秒で消える）。
  const [comment, setComment] = useState<string | null>(null)
  // 保存直後だけ出す「アルバムに保存したよ」フィードバック。
  const [savedFlash, setSavedFlash] = useState(false)
  // 初発見の「はじめて見つけた！」演出（クロップ縮小＋名前）。数秒で消える。
  const [discovery, setDiscovery] = useState<{ name: string; url: string } | null>(null)
  // 既知種を再発見したとき、新しいクロップで「写真を更新する？」を選ばせるプロンプト。
  const [pendingUpdate, setPendingUpdate] = useState<
    { id: string; name: string; count: number; url: string; blob: Blob } | null
  >(null)
  // 軽い通知トースト（「写真を更新したよ」等）。
  const [foundToast, setFoundToast] = useState<string | null>(null)
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

  // 撮る → コレットが判定＆ひとこと → 主役を図鑑に収集 → 全体をアルバムに保存（カメラの主ループ）。
  const handleCapture = useCallback(async () => {
    const video = videoRef.current
    if (!video || busy) return
    setBusy(true)
    setError(null)
    setComment(null)
    setFoundToast(null)
    setPendingUpdate(null) // 前回の「更新する？」は次の撮影で閉じる
    fireReaction('thinking') // 「見てるね…」の即時フィードバック
    primeAudio() // 撮影タップ（ユーザー操作）内で iOS 自動再生をアンロック
    try {
      const photo = await captureFrame(video)
      // テキスト先行：判定（ひとこと＋感情＋主役）を取りに行く。演出なので失敗しても写真は残す。
      let commentText: string | undefined
      let emotion: FairyExpression | undefined
      let subjectName: string | undefined // アルバムの図鑑的キャプション用（被写体名）
      let caption: string | undefined // 同・被写体そのものの客観的な説明
      try {
        const result = await identifyProvider.identify(photo, { personaId: characterId })
        commentText = result.comment
        emotion = result.emotion
        setComment(result.comment)
        fireReaction(result.emotion ?? 'happy')
        void speak(result.comment) // 反応を動的TTSで読み上げ（voiceEnabled は speak 内でゲート）

        // 主役が採れたら bbox でクロップして図鑑に収集（無料・無制限）。
        if (result.subject) {
          subjectName = result.subject.name
          caption = result.subject.description || undefined
          try {
            const crop = await cropToBlob(photo, result.subject.bbox)
            const { entry, isNew } = await collect(result.subject, crop)
            if (isNew) {
              setDiscovery({ name: entry.name, url: URL.createObjectURL(crop) })
              fireReaction('excited')
            } else {
              // 再発見：新しいクロップを見せて「写真を更新する？」を選ばせる（自動では差し替えない）。
              setPendingUpdate({
                id: entry.id,
                name: entry.name,
                count: entry.count,
                url: URL.createObjectURL(crop),
                blob: crop,
              })
            }
          } catch {
            // クロップ/収集の失敗は演出だけ諦める（アルバム保存は続ける）。
          }
        }
      } catch {
        // 判定失敗＝コレットは黙って受け取る（写真の保存は続ける）。
        fireReaction('happy')
      }
      await addPhoto({ blob: photo, comment: commentText, emotion, subjectName, caption })
      setSavedFlash(true)
      // 撮影＝「安い日常行動」＝まほうパワー＋絆を少し貯める（保存できたときだけ）。
      addGauge(GAUGE_PER_CAPTURE)
      addAffinity(AFFINITY_PER_CAPTURE)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setBusy(false)
    }
  }, [busy, characterId, fireReaction, addPhoto, collect, addGauge, addAffinity])

  // 再発見時の「写真を更新する？」への応答。
  const confirmUpdate = useCallback(async () => {
    if (!pendingUpdate) return
    try {
      await updatePhoto(pendingUpdate.id, pendingUpdate.blob)
      setFoundToast('写真を更新したよ')
    } catch {
      // 更新失敗は黙って諦める（元の写真のまま）。
    } finally {
      setPendingUpdate(null)
    }
  }, [pendingUpdate, updatePhoto])
  const dismissUpdate = useCallback(() => setPendingUpdate(null), [])

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

  // 既知種の再発見トーストは短めに消す。
  useEffect(() => {
    if (!foundToast) return
    const timer = setTimeout(() => setFoundToast(null), 2500)
    return () => clearTimeout(timer)
  }, [foundToast])

  // 初発見バナーは数秒で消す。消えるタイミングでクロップの object URL を解放する。
  useEffect(() => {
    if (!discovery) return
    const timer = setTimeout(() => setDiscovery(null), 3500)
    return () => clearTimeout(timer)
  }, [discovery])
  useEffect(() => {
    const url = discovery?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [discovery])

  // 「写真を更新する？」プロンプトは操作が要るので長めに出し、放置なら閉じる（＝このまま）。
  useEffect(() => {
    if (!pendingUpdate) return
    const timer = setTimeout(() => setPendingUpdate(null), 9000)
    return () => clearTimeout(timer)
  }, [pendingUpdate])
  useEffect(() => {
    const url = pendingUpdate?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [pendingUpdate])

  // ベース表情（状態由来）。リアクション中はそれを一時的に上書きする。
  const baseExpression: FairyExpression = busy ? 'thinking' : cameraError ? 'sad' : 'neutral'
  const expression = reactionExpression ?? baseExpression

  return (
    <div className="relative flex h-full flex-col bg-slate-900 text-white">
      {/* ライブビュー */}
      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

      {/* ホームへ戻る（左上・作業画面と同じ位置） */}
      <button
        type="button"
        onClick={() => go('home')}
        aria-label="ホームへ戻る"
        className="absolute left-3 top-3 z-10 rounded-full bg-slate-900/60 px-3 py-1.5 text-sm font-bold text-white shadow-pop transition active:scale-95"
      >
        ← ホーム
      </button>

      {/* 声 ON/OFF（コレットの反応読み上げ・グローバル設定） */}
      <button
        type="button"
        onClick={() => {
          // 声をONにするタップ内でアンロック（撮影前に有効化しても初回反応が鳴るように）。
          if (!voiceEnabled) primeAudio()
          toggleVoice()
        }}
        aria-label={voiceEnabled ? '声をオフにする' : '声をオンにする'}
        className="absolute right-3 top-3 z-10 rounded-full bg-slate-900/60 px-3 py-1.5 text-lg shadow-pop transition active:scale-95"
      >
        {voiceEnabled ? '🔊' : '🔇'}
      </button>

      {/* カメラ不可時のフォールバック */}
      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/90 px-6 text-center">
          <h1 className="font-display text-2xl font-bold text-mint">カメラモード</h1>
          <p className="max-w-xs text-sm text-slate-300">{cameraError}</p>
        </div>
      )}

      {/* 初発見の演出：クロップ縮小＋「はじめて見つけた！」 */}
      {discovery && (
        <div className="pointer-events-none absolute inset-x-0 top-10 flex justify-center px-6">
          <div className="animate-reveal flex items-center gap-3 rounded-3xl bg-white/95 px-4 py-3 text-slate-800 shadow-pop">
            <img
              src={discovery.url}
              alt={discovery.name}
              className="h-14 w-14 rounded-2xl object-cover"
            />
            <div className="text-left">
              <p className="text-xs font-bold text-lavender">はじめて見つけた！</p>
              <p className="font-display text-lg font-bold leading-tight">{discovery.name}</p>
            </div>
          </div>
        </div>
      )}

      {/* 再発見：新しいクロップで「写真を更新する？」を選ばせる */}
      {pendingUpdate && (
        <div className="absolute inset-x-0 top-10 flex justify-center px-6">
          <div className="animate-reveal flex items-center gap-3 rounded-3xl bg-white/95 px-4 py-3 text-slate-800 shadow-pop">
            <img
              src={pendingUpdate.url}
              alt={pendingUpdate.name}
              className="h-14 w-14 rounded-2xl object-cover"
            />
            <div className="text-left">
              <p className="text-xs font-bold text-lavender">
                また見つけた！ ×{pendingUpdate.count}
              </p>
              <p className="font-display text-base font-bold leading-tight">{pendingUpdate.name}</p>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => void confirmUpdate()}
                  className="rounded-full bg-mint px-3 py-1 text-xs font-bold text-slate-900 shadow-pop transition active:scale-95"
                >
                  写真を更新
                </button>
                <button
                  type="button"
                  onClick={dismissUpdate}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-bold text-slate-500 transition active:scale-95"
                >
                  このまま
                </button>
              </div>
            </div>
          </div>
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
          {foundToast && (
            <p className="rounded-full bg-lavender/90 px-4 py-1 text-sm font-bold text-white shadow-pop">
              {foundToast}
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
          level={affinityLevel}
        />
      </div>
    </div>
  )
}
