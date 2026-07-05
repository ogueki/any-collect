/**
 * クロマキー除去（v2・STEP1e 透過フォールバック）。
 * Gemini はネイティブ透過が苦手（「透過」を市松模様として描き込む）ため、サーバには
 * 単色フラットのマゼンタ背景（#FF00FF）で描かせ（`api/_lib/item-prompt.ts` の
 * `ITEM_SOLID_BG`）、ここでそのマゼンタをアルファに抜いて透過 PNG を作る。
 * 画像生成を伴わないクライアント側 canvas 処理＝無料（crop.ts と同じ路線）。
 *
 * マゼンタ判定は「緑が赤・青より十分低い」量（spill = min(r,b) - g）で行う。
 * 赤(青が低い)・緑(緑が高い)・青(赤が低い)などの一般色は spill が小さく残り、
 * マゼンタ/濃ピンク/紫だけが抜ける（＝被写体にその色があると穴＝既知の割り切り）。
 */

/** spill(=min(r,b)-g) がこの値以上なら背景（完全に抜く）。 */
const SPILL_FULL = 90
/** spill がこの値以下なら被写体（残す）。中間はフェザー＋despill。 */
const SPILL_KEEP = 20
/** 四隅の平均 spill がこれ未満なら「マゼンタ背景でない」と見なし無加工で返す（安全弁）。 */
const CORNER_MIN = 100

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
    img.src = src
  })
}

function spillAt(d: Uint8ClampedArray, i: number): number {
  return Math.min(d[i], d[i + 2]) - d[i + 1]
}

/**
 * data URL 画像のマゼンタ背景を透過にした PNG の data URL を返す。
 * マゼンタ背景が検出できない/処理に失敗した場合は元の data URL をそのまま返す（透過なしでも動く）。
 */
export async function removeMagentaToPng(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return dataUrl

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)

  let image: ImageData
  try {
    image = ctx.getImageData(0, 0, w, h)
  } catch {
    return dataUrl // 万一 taint していたら諦める
  }
  const d = image.data

  // 安全弁：四隅がマゼンタでなければ（モデルが指示を無視した等）無加工で返す。
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4]
  const cornerAvg = corners.reduce((s, i) => s + spillAt(d, i), 0) / corners.length
  if (cornerAvg < CORNER_MIN) return dataUrl

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const spill = Math.min(r, b) - g
    if (spill <= SPILL_KEEP) continue // 被写体：そのまま

    if (spill >= SPILL_FULL) {
      d[i + 3] = 0 // 背景：完全透過
      continue
    }
    // 縁（中間）：フェザーで半透明にしつつ、マゼンタのにじみ（赤・青の過剰）を殺す。
    d[i + 3] = Math.round((255 * (SPILL_FULL - spill)) / (SPILL_FULL - SPILL_KEEP))
    d[i] = r - spill // despill: 赤を緑に寄せる
    d[i + 2] = b - spill // despill: 青を緑に寄せる
  }

  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}
