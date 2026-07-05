/**
 * クロマキー除去（v2・STEP1e 透過）。
 * Gemini はネイティブ透過が苦手（「透過」を市松模様として描き込む）ため、サーバには
 * 単色フラットのマゼンタ背景（#FF00FF）で描かせ（`api/_lib/item-prompt.ts` の
 * `ITEM_SOLID_BG`）、ここでその背景をアルファに抜いて透過 PNG を作る。
 * 画像生成を伴わないクライアント側 canvas 処理＝無料（crop.ts と同じ路線）。
 *
 * マゼンタ判定は「緑が赤・青より十分低い」量 spill = min(r,b) - g で行う（grey/skin/red は
 * spill≒0 で安全に残り、マゼンタ/ピンク/紫だけ spill が高い）。ただし Gemini が返す
 * マゼンタの濃さは一定しない（純マゼンタ〜ラズベリー系ピンク）ので、**四隅から実際の
 * 背景 spill をサンプルして閾値を自動調整**する（固定閾値だと薄めのピンクを取りこぼす）。
 *
 * 既知の割り切り：被写体にマゼンタ/濃ピンク/紫があると、そこも抜けて穴になる。
 */

/** 背景の spill がこれ未満なら「マゼンタ背景ではない」と見なし無加工で返す（安全弁）。 */
const MIN_BG_SPILL = 35
/** 背景 spill に対し、これ以上を完全透過にする比率。 */
const FULL_RATIO = 0.5
/** 背景 spill に対し、これ以下を被写体として残す比率（中間はフェザー＋despill）。 */
const KEEP_RATIO = 0.2

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
    img.src = src
  })
}

/** (x0,y0) から n×n ブロックの平均色をサンプルして spill を返す。 */
function cornerSpill(d: Uint8ClampedArray, w: number, x0: number, y0: number, n: number): number {
  let r = 0
  let g = 0
  let b = 0
  let c = 0
  for (let y = y0; y < y0 + n; y++) {
    for (let x = x0; x < x0 + n; x++) {
      const i = (y * w + x) * 4
      r += d[i]
      g += d[i + 1]
      b += d[i + 2]
      c++
    }
  }
  if (c === 0) return -Infinity
  return Math.min(r / c, b / c) - g / c
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

  // 四隅の背景をサンプルし、最も「マゼンタらしい」隅を背景基準にする
  // （被写体が1隅に掛かっても、他の隅で拾える）。
  const n = Math.max(4, Math.floor(Math.min(w, h) * 0.04))
  const bgSpill = Math.max(
    cornerSpill(d, w, 0, 0, n),
    cornerSpill(d, w, w - n, 0, n),
    cornerSpill(d, w, 0, h - n, n),
    cornerSpill(d, w, w - n, h - n, n),
  )
  if (bgSpill < MIN_BG_SPILL) return dataUrl // マゼンタ背景でなければ無加工

  const full = bgSpill * FULL_RATIO
  const keep = bgSpill * KEEP_RATIO
  const span = full - keep || 1

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const spill = Math.min(r, b) - g
    if (spill <= keep) continue // 被写体：そのまま

    if (spill >= full) {
      d[i + 3] = 0 // 背景：完全透過
      continue
    }
    // 縁（中間）：フェザーで半透明にしつつ、マゼンタのにじみ（赤・青の過剰）を殺す。
    d[i + 3] = Math.round((255 * (full - spill)) / span)
    d[i] = r - spill // despill: 赤を緑に寄せる
    d[i + 2] = b - spill // despill: 青を緑に寄せる
  }

  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}
