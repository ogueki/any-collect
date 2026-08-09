/**
 * Blob（アルバムの写真）を、モデルに送るための小さい data URL にする。
 *
 * 撮影時点で既に縮小済みだが、会話に添える用途ではさらに小さくてよい
 * （トークン＝コストと、屋外の上り帯域＝待ち時間の両方に効く）。
 * 送る前に必ずここを通す（spec §9「画像はダウンスケールして送る」）。
 */

/** 会話に添える写真の最大辺。判定（カメラ）より小さくてよい＝細部でなく「何が写っているか」が要るだけ。 */
export const CHAT_IMAGE_MAX_DIMENSION = 512

export async function blobToDownscaledDataUrl(
  blob: Blob,
  maxDimension = CHAT_IMAGE_MAX_DIMENSION,
  quality = 0.8,
): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas を初期化できませんでした')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    bitmap.close()
  }
}
