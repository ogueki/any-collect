/**
 * 透過スプライトのアルファチャンネルから物理エンジン用の凸包ポリゴンを作る（オマケ＝タワーバトル）。
 * 透過アイテムの「いびつな形」を当たり判定にそのまま使い、グラグラ積み上がる手触りを出すためのもの。
 *
 * iconUrl は窯のクロマキー処理で作った透過 PNG の data URL（IndexedDB ローカル＝canvas 安全・
 * `chromaKey.ts` と同じ `loadImage`+`getImageData` 路線）なので getImageData が通る。
 * 凸包なので concave 分解ライブラリは不要（`Matter.Bodies.fromVertices` にそのまま渡せる）。
 * アルファが薄い/空などで頂点が採れないときは vertices=null を返す（呼び出し側は矩形にフォールバック）。
 */

export interface Vec {
  x: number
  y: number
}

export interface SpritePiece {
  /** 描画用に読み込み済みの画像。 */
  img: HTMLImageElement
  /** テクスチャ描画サイズ（px・自然比を size に収めた値）。 */
  width: number
  height: number
  /** 凸包頂点（画像中心を原点とする local 座標・px）。null＝矩形フォールバック。 */
  vertices: Vec[] | null
  /** 頂点群の面積重心（画像中心原点）。body.position（＝重心）から画像中心へ戻す描画オフセットに使う。 */
  centroid: Vec
}

/** アルファ読み取りのサンプル解像度（長辺 px）。小さくして高速に。 */
const SAMPLE_LONG = 64
/** これ超の α を「不透明」とみなす。 */
const ALPHA_THRESHOLD = 40
/** 凸包の最大頂点数（物理の安定と当たりの素直さ）。 */
const MAX_VERTS = 12

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
    img.src = src
  })
}

/** Andrew's monotone chain による凸包（入力を破壊しない）。返りは頂点列（>=3 で有効）。 */
function convexHull(points: Vec[]): Vec[] {
  if (points.length < 3) return points.slice()
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Vec[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Vec[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** 頂点を最大 maxN 個に間引く（等間隔ピック）。 */
function decimate(hull: Vec[], maxN: number): Vec[] {
  if (hull.length <= maxN) return hull
  const step = hull.length / maxN
  const out: Vec[] = []
  for (let i = 0; i < maxN; i++) out.push(hull[Math.floor(i * step)])
  return out
}

/** 多角形の面積重心（縮退時は頂点平均）。 */
function polygonCentroid(poly: Vec[]): Vec {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const cr = p.x * q.y - q.x * p.y
    a += cr
    cx += (p.x + q.x) * cr
    cy += (p.y + q.y) * cr
  }
  a *= 0.5
  if (Math.abs(a) < 1e-6) {
    let sx = 0
    let sy = 0
    for (const p of poly) {
      sx += p.x
      sy += p.y
    }
    return { x: sx / poly.length, y: sy / poly.length }
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

/**
 * url の透過スプライトを読み込み、当たり判定用の凸包（画像中心原点・表示 size にスケール）を作る。
 * size＝ゲーム内での表示長辺 px。頂点が採れなければ vertices=null（矩形フォールバック）。
 */
export async function buildSpritePiece(url: string, size: number): Promise<SpritePiece> {
  const img = await loadImage(url)
  const nw = img.naturalWidth || img.width
  const nh = img.naturalHeight || img.height
  const scaleDisp = size / Math.max(nw || 1, nh || 1)
  const width = (nw || size) * scaleDisp
  const height = (nh || size) * scaleDisp
  const fallback: SpritePiece = { img, width, height, vertices: null, centroid: { x: 0, y: 0 } }
  if (!nw || !nh) return fallback

  const scaleSample = SAMPLE_LONG / Math.max(nw, nh)
  const sw = Math.max(1, Math.round(nw * scaleSample))
  const sh = Math.max(1, Math.round(nh * scaleSample))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return fallback
  ctx.drawImage(img, 0, 0, sw, sh)
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, sw, sh).data
  } catch {
    return fallback // tainted 等（将来 Supabase URL 化時に CORS が要る場合）。
  }

  const pts: Vec[] = []
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (data[(y * sw + x) * 4 + 3] > ALPHA_THRESHOLD) pts.push({ x, y })
    }
  }
  if (pts.length < 3) return fallback

  const hull = decimate(convexHull(pts), MAX_VERTS)
  if (hull.length < 3) return fallback

  // サンプル座標 → 表示座標・原点を画像中心へ。
  const fx = width / sw
  const fy = height / sh
  const vertices = hull.map((p) => ({ x: p.x * fx - width / 2, y: p.y * fy - height / 2 }))
  const centroid = polygonCentroid(vertices)
  return { img, width, height, vertices, centroid }
}
