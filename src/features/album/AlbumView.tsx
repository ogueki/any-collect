import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useAlbumStore } from '../../store/albumStore'
import Sprite2DRenderer from '../../lib/character/Sprite2DRenderer'
import type { Photo } from '../../types'

/**
 * アルバム（旧・図鑑を置換／v2）。カメラで保存した写真を一覧・詳細で見返す。
 * 写真＝思い出資産であり、コレットの会話接地（写真言及）の燃料源（§4.2）。
 * 永続層は albumStore 越し。画像は Blob なので object URL を作って表示・解放する。
 */

/** ISO 8601 を「2026/7/2」形式に。 */
function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ja-JP')
}

export default function AlbumView() {
  const characterId = useAppStore((s) => s.characterId)
  const photos = useAlbumStore((s) => s.photos)
  const status = useAlbumStore((s) => s.status)
  const error = useAlbumStore((s) => s.error)
  const load = useAlbumStore((s) => s.load)
  const remove = useAlbumStore((s) => s.remove)

  const [selected, setSelected] = useState<Photo | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // マウント時にアルバムを読み込む（ローカルなので軽い）。
  useEffect(() => {
    void load()
  }, [load])

  // Blob → object URL（写真ごと）。photos が変わるたび作り直し、前回分は cleanup で解放する。
  const urls = useMemo(() => {
    const map = new Map<string, string>()
    photos.forEach((p) => map.set(p.id, URL.createObjectURL(p.blob)))
    return map
  }, [photos])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  const closeDetail = () => {
    setSelected(null)
    setConfirmDelete(false)
  }

  const handleDelete = async () => {
    if (!selected || deleting) return
    setDeleting(true)
    try {
      await remove(selected.id)
      closeDetail()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col">
      {/* 読み込み中 */}
      {status === 'loading' && photos.length === 0 && (
        <p className="mt-10 animate-pulse text-center text-sm text-slate-400">読み込み中…</p>
      )}

      {/* エラー */}
      {status === 'error' && <p className="mt-10 text-center text-sm text-peach">{error}</p>}

      {/* 空状態：妖精＋誘導 */}
      {status !== 'loading' && status !== 'error' && photos.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <Sprite2DRenderer characterId={characterId} expression="neutral" size="lg" />
          <p className="text-sm text-slate-500">まだ写真がないみたい。</p>
          <p className="text-sm text-slate-500">カメラでコレットに見せてみよう！</p>
        </div>
      )}

      {/* グリッド */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setSelected(photo)}
              className="overflow-hidden rounded-2xl bg-white shadow-pop transition active:scale-95"
            >
              <img
                src={urls.get(photo.id)}
                alt=""
                className="aspect-square w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* 詳細モーダル */}
      {selected && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/60 px-6"
          onClick={closeDetail}
        >
          <div
            className="w-full max-w-xs rounded-3xl bg-white p-4 text-slate-800 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={urls.get(selected.id)}
              alt=""
              className="mx-auto w-full rounded-2xl object-contain"
            />
            {selected.comment && (
              <div className="mt-3 rounded-2xl bg-lavender/10 px-3 py-2 text-sm text-slate-600">
                <span className="mr-1 text-xs font-bold text-lavender">コレット</span>
                {selected.comment}
              </div>
            )}
            <p className="mt-2 text-center text-xs text-slate-400">
              {formatDate(selected.createdAt)} に見せた
            </p>

            <div className="mt-4 flex items-center justify-center gap-3">
              {!confirmDelete ? (
                <>
                  <button
                    type="button"
                    onClick={closeDetail}
                    className="rounded-full bg-mint px-6 py-2 font-bold text-slate-900 shadow-pop transition active:scale-95"
                  >
                    閉じる
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-400 transition active:scale-95"
                  >
                    削除
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="rounded-full bg-peach px-5 py-2 font-bold text-white shadow-pop transition active:scale-95 disabled:opacity-50"
                  >
                    {deleting ? '削除中…' : '本当に削除'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-500 transition active:scale-95"
                  >
                    やめる
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
