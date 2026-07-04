/**
 * 図鑑（Seek 型）用のクロップ util（STEP1d）。
 * 判定で得た主役の bbox（0–1000 正規化）を使って、撮影フレームから主役部分だけを
 * 正方形に切り出す。画像生成を伴わないクライアント側処理＝無料（v2 のコスト思想）。
 *
 * タイル表示（object-cover の正方セル）に合うよう、bbox 中心の正方領域を切り出す。
 * モデルが min/max を取り違えても壊れないよう並びは吸収し、退化 bbox は全体にフォールバックする。
 */

const OUT_MIN = 256
const OUT_MAX = 1024
const PAD_RATIO = 0.06 // bbox の長辺に対する余白

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** 撮影フレーム(Blob) と bbox([ymin,xmin,ymax,xmax] 0–1000) から、正方クロップの JPEG Blob を返す。 */
export async function cropToBlob(
  source: Blob,
  bbox: [number, number, number, number],
): Promise<Blob> {
  const bitmap = await createImageBitmap(source)
  try {
    const w = bitmap.width
    const h = bitmap.height
    const [ymin, xmin, ymax, xmax] = bbox

    // 0–1000 → px。min/max の取り違えを吸収し、画像内にクランプする。
    let top = clamp((Math.min(ymin, ymax) / 1000) * h, 0, h)
    let left = clamp((Math.min(xmin, xmax) / 1000) * w, 0, w)
    let boxH = clamp((Math.max(ymin, ymax) / 1000) * h, 0, h) - top
    let boxW = clamp((Math.max(xmin, xmax) / 1000) * w, 0, w) - left

    // 退化した bbox（点や線）なら画像全体にフォールバック。
    if (boxW < 4 || boxH < 4) {
      left = 0
      top = 0
      boxW = w
      boxH = h
    }

    // bbox 中心に、長辺＋余白の正方領域を取り、画像内に収める。
    const cx = left + boxW / 2
    const cy = top + boxH / 2
    const side = Math.min(Math.max(boxW, boxH) * (1 + PAD_RATIO * 2), w, h)
    const sx = clamp(cx - side / 2, 0, w - side)
    const sy = clamp(cy - side / 2, 0, h - side)

    const outSize = Math.round(clamp(side, OUT_MIN, OUT_MAX))
    const canvas = document.createElement('canvas')
    canvas.width = outSize
    canvas.height = outSize
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas を初期化できませんでした')
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, outSize, outSize)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('クロップ画像の取り出しに失敗しました'))),
        'image/jpeg',
        0.85,
      )
    })
  } finally {
    bitmap.close()
  }
}
