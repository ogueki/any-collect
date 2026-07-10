import { buildSpritePiece, type SpritePiece } from '../../lib/image/alphaShape'

/**
 * フラッピー風ゲーム（オマケ②）の物理＋描画コア。React 非依存＝canvas と主役アイテムと
 * callbacks を受けるだけ。matter.js は不要（重力＋タップで上昇の素朴なループ）。
 *
 * **固定タイムステップ**で更新する（タワーバトルの実機バグ＝可変 dt で挙動が乱れる教訓を最初から適用）。
 * 実フレーム間隔が乱れても 1 ステップ = 1000/60ms 固定で進め、フレーム飛びは複数ステップで追いつく。
 *
 * 主役＝集めた透過アイテム（`buildSpritePiece` で読み込み・当たりは矩形）。障害物＝妖精界トーンの
 * パステルな柱（上下に隙間）。当たり or 地面で終了、くぐった数がスコア。
 *
 * **難易度は本家相当で一定**（本家同様、進行によるランプは持たない）。本家は 288×512 の固定解像度で
 * 描いて拡大するが、こちらは canvas サイズが端末で変わるので、**縦の量は地面までの高さ・横の量は画面幅**で
 * 相似スケールする。これで端末に依らず同じ密度（柱は 1.4 秒に 1 本・隙間は空の 1/4・1 はばたきで空の
 * 約 1 割ぶん上昇）になる。特に柱の間隔は px ではなく**ステップ数で固定**する（画面幅に比例させると
 * PC の全画面で 6 秒に 1 本になり、別ゲームになってしまう）。
 */

export interface FlappyItem {
  id: string
  iconUrl: string
  name: string
}

export interface FlappyCallbacks {
  /** スコア（くぐった数）が増えるたび。 */
  onScore: (score: number) => void
  /** 妖精リアクション（節目 / 墜落）。 */
  onReaction: (kind: 'score' | 'crash') => void
  /** 終了（最終スコア）。 */
  onGameOver: (score: number) => void
}

export interface FlappyGameHandle {
  /** タップ＝はばたく（ready のときは最初の flap でゲーム開始）。 */
  flap: () => void
  /** リスタート（同じアイテムでもう一回）。 */
  restart: () => void
  /** 破棄（rAF 停止）。 */
  destroy: () => void
}

/** 物理は固定タイムステップ（matter と同じ教訓＝可変 dt を避ける）。 */
const FIXED_DT = 1000 / 60
const MAX_STEPS = 5

// --- 本家の基準値（288×512・地面より上が 400px の論理解像度。1 フレーム = 1/60 秒） ---
const REF_W = 288 // 論理幅（横の量のスケール元）
const REF_SKY = 400 // 地面より上の高さ（縦の量のスケール元）
const REF_GRAVITY = 0.25 // 毎フレーム vy に加算
const REF_FLAP_VY = -4.6 // はばたきで vy をこの値に
const REF_MAX_FALL = 10 // 落下速度の上限
const REF_SCROLL = 2 // 柱が左へ流れる速さ
const REF_COL_W = 52 // 柱の幅

// 難易度の本体は「隙間 ÷ 主役の当たり高さ」。実機で「本家ほどの死にゲー感がない」と分かったので
// 隙間を本家より締め、さらに主役を大きくして（＝当たりを大きくして）締めている。周期を縮める方は、
// 隙間中心の移動を吸収する余地まで削れて理不尽になったので採らない。
// 緩めたいときは `birdSizeFor` の係数を下げる（視認性は落ちる）か、REF_GAP を上げる。
const REF_GAP = 86 // 上下の柱の隙間（本家は 100＝空の 1/4）
const REF_EDGE_MARGIN = 62 // 隙間の上下に必ず残す柱の長さ（＝隙間中心のブレ幅の上限を決める）
/** 柱と柱の間隔（固定ステップ数＝1.4 秒＝本家と同じ）。画面幅に依らず周期を一定に保つための時間基準。 */
const COLUMN_INTERVAL_STEPS = 84

/**
 * 当たり矩形＝**実際に見えている範囲**（アルファの外接矩形）の何割か。
 * 透過アイテムは画像の外周に透明な余白を持つので、描画寸法をそのまま使うと当たりが余白ぶんズレる
 * （余白が多い絵ほど「何もない所で当たる」、少ない絵ほど「めり込んでも当たらない」）。
 */
const HIT_SCALE = 0.92
/**
 * 隙間は最低でも主役の当たり高さの何倍か＝**通れなくなるのを防ぐ安全下限**（画面が横長で主役が空に
 * 対して大きいとき用）。通常は `REF_GAP` の方が大きいのでこちらは効かない。ここを上げると主役を
 * 大きくしたぶん隙間まで広がってしまい、`REF_GAP` の意味が消えるので注意。
 */
const GAP_PER_BIRD = 2.5

const MILESTONE = 5 // この数くぐるごとに excited

/**
 * 主役の表示長辺 px（画面幅から。小さすぎ/大きすぎを避ける）。
 * 当たりはここから作る（`visibleBounds` × `HIT_SCALE`）ので、**大きくすると難しくなる**。
 * 実機で 55px は視認性が悪かったため 66px 相当まで上げた（＝隙間 ÷ 当たり高さ 3.74 → 3.12）。
 */
function birdSizeFor(cssW: number): number {
  return Math.round(Math.min(84, Math.max(46, cssW * 0.17)))
}

interface Column {
  x: number // 柱の中心 x
  gapCenter: number // 隙間の中心 y
  passed: boolean
}

/**
 * 主役の「見えている範囲」（アルファ凸包の外接矩形・画像中心が原点）。
 * 凸包が採れなければ描画寸法そのもの（＝矩形フォールバック）。
 */
function visibleBounds(sprite: SpritePiece): { dx: number; dy: number; hw: number; hh: number } {
  const v = sprite.vertices
  if (!v || v.length < 3) return { dx: 0, dy: 0, hw: sprite.width / 2, hh: sprite.height / 2 }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of v) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { dx: (minX + maxX) / 2, dy: (minY + maxY) / 2, hw: (maxX - minX) / 2, hh: (maxY - minY) / 2 }
}

export async function createFlappyGame(
  canvas: HTMLCanvasElement,
  item: FlappyItem,
  cb: FlappyCallbacks,
): Promise<FlappyGameHandle> {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d コンテキストを取得できませんでした')

  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
  const W = canvas.clientWidth || 360
  const H = canvas.clientHeight || 560
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)

  const birdSize = birdSizeFor(W)
  const birdX = Math.round(W * 0.3)
  const groundH = Math.round(H * 0.1)
  const groundY = H - groundH
  const centerY = groundY / 2

  // 本家の基準値を、縦は空の高さ・横は画面幅で相似スケールする。
  const sy = groundY / REF_SKY
  const sx = W / REF_W
  const GRAVITY = REF_GRAVITY * sy
  const FLAP_VY = REF_FLAP_VY * sy
  const MAX_FALL = REF_MAX_FALL * sy
  const SCROLL = REF_SCROLL * sx
  const colW = Math.round(REF_COL_W * sx)
  const spacing = SCROLL * COLUMN_INTERVAL_STEPS // 幅ではなく時間で決める（周期を端末で揃える）
  const firstX = W + colW // 最初の柱は画面右外から

  // 主役の画像を読み込む（透過アイテムの data URL＝canvas 安全）。当たりは凸包の外接矩形、描画は img/寸法。
  const sprite = await buildSpritePiece(item.iconUrl, birdSize)
  const birdW = sprite.width
  const birdH = sprite.height
  // 当たりは「見えている範囲」基準。画像中心とズレることがあるので、その分（dx/dy）を足して判定する。
  const bounds = visibleBounds(sprite)
  const hitHW = bounds.hw * HIT_SCALE
  const hitHH = bounds.hh * HIT_SCALE
  const hitDX = bounds.dx
  const hitDY = bounds.dy

  // 隙間は空に対する比で決める。主役が空に対して大きい端末（横長など）でも通れる下限は割らない。
  const GAP = Math.max(Math.round(REF_GAP * sy), Math.round(hitHH * 2 * GAP_PER_BIRD))
  const edgeMargin = REF_EDGE_MARGIN * sy

  const columns: Column[] = []
  let birdY = centerY
  let vy = 0
  let score = 0
  let phase: 'ready' | 'playing' | 'over' = 'ready'
  let raf = 0
  let last = -1 // 初回フレームで rAF の now に揃える（時計の混在＝初回巨大 dt を避ける）
  let acc = 0

  const randGapCenter = (): number => {
    const top = GAP / 2 + edgeMargin
    const bottom = groundY - GAP / 2 - edgeMargin
    return top + Math.random() * Math.max(0, bottom - top)
  }

  const spawnIfNeeded = () => {
    if (columns.length === 0) {
      columns.push({ x: firstX, gapCenter: randGapCenter(), passed: false })
      return
    }
    const lastCol = columns[columns.length - 1]
    if (lastCol.x <= firstX - spacing) {
      columns.push({ x: lastCol.x + spacing, gapCenter: randGapCenter(), passed: false })
    }
  }

  const endGame = () => {
    if (phase === 'over') return
    phase = 'over'
    cb.onReaction('crash')
    cb.onGameOver(score)
  }

  const hitsColumn = (): boolean => {
    const top = birdY + hitDY - hitHH
    const bottom = birdY + hitDY + hitHH
    const left = birdX + hitDX - hitHW
    const right = birdX + hitDX + hitHW
    for (const c of columns) {
      const cl = c.x - colW / 2
      const cr = c.x + colW / 2
      if (right < cl || left > cr) continue // x が重ならない
      const gapTop = c.gapCenter - GAP / 2
      const gapBottom = c.gapCenter + GAP / 2
      if (top < gapTop || bottom > gapBottom) return true
    }
    return false
  }

  const step = () => {
    if (phase !== 'playing') return
    vy = Math.min(MAX_FALL, vy + GRAVITY)
    birdY += vy

    // 天井は抜けない（クランプ）。
    if (birdY + hitDY - hitHH < 0) {
      birdY = hitHH - hitDY
      if (vy < 0) vy = 0
    }
    // 地面は墜落。
    if (birdY + hitDY + hitHH >= groundY) {
      birdY = groundY - hitHH - hitDY
      endGame()
      return
    }

    for (const c of columns) c.x -= SCROLL
    // 画面外に出た先頭を捨てる。
    while (columns.length && columns[0].x < -colW) columns.shift()
    spawnIfNeeded()

    // スコア（柱の中心を通過）。
    for (const c of columns) {
      if (!c.passed && c.x < birdX) {
        c.passed = true
        score += 1
        cb.onScore(score)
        if (score % MILESTONE === 0) cb.onReaction('score')
      }
    }

    if (hitsColumn()) endGame()
  }

  // --- 描画 ---
  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2))
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }

  // 妖精界トーンの柱（葉っぱ/新芽っぽいパステル）。gapSide＝隙間に面する端にキャップ。
  const drawPillar = (cx: number, topY: number, botY: number, capAtTop: boolean) => {
    const x = cx - colW / 2
    const h = botY - topY
    if (h <= 0) return
    const grad = ctx.createLinearGradient(x, 0, x + colW, 0)
    grad.addColorStop(0, '#6ee7b7')
    grad.addColorStop(0.5, '#a7f3d0')
    grad.addColorStop(1, '#6ee7b7')
    ctx.fillStyle = grad
    roundRect(x, topY, colW, h, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)'
    ctx.lineWidth = 2
    ctx.stroke()
    // キャップ（新芽の頭）。
    const capH = 16
    const capW = colW + 12
    const capY = capAtTop ? botY - capH : topY
    ctx.fillStyle = '#34d399'
    roundRect(cx - capW / 2, capY, capW, capH, 8)
    ctx.fill()
    // きらり。
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.beginPath()
    ctx.arc(cx - colW * 0.18, capAtTop ? botY - capH / 2 : topY + capH / 2, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }

  const cloudOffset = (now: number, speed: number, span: number, phaseOff: number): number => {
    const t = (now * speed + phaseOff) % span
    return span - t // 右→左
  }

  const drawCloud = (x: number, y: number, s: number) => {
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.beginPath()
    ctx.arc(x, y, s, 0, Math.PI * 2)
    ctx.arc(x + s * 0.9, y + s * 0.15, s * 0.8, 0, Math.PI * 2)
    ctx.arc(x - s * 0.9, y + s * 0.2, s * 0.7, 0, Math.PI * 2)
    ctx.fill()
  }

  const render = (now: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // 空（妖精界と同じパステルグラデ）。
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#dbeafe')
    sky.addColorStop(0.45, '#ede9fe')
    sky.addColorStop(1, '#d1fae5')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, H)

    // 流れる雲（パララックス・ゆっくり）。
    const span = W + 160
    drawCloud(cloudOffset(now, 0.008, span, 0) - 80, H * 0.18, 22)
    drawCloud(cloudOffset(now, 0.006, span, span * 0.5) - 80, H * 0.32, 16)
    drawCloud(cloudOffset(now, 0.01, span, span * 0.8) - 80, H * 0.12, 13)

    // 柱。
    for (const c of columns) {
      const gapTop = c.gapCenter - GAP / 2
      const gapBottom = c.gapCenter + GAP / 2
      drawPillar(c.x, 0, gapTop, true) // 上の柱（下端にキャップ）
      drawPillar(c.x, gapBottom, groundY, false) // 下の柱（上端にキャップ）
    }

    // 地面。
    ctx.fillStyle = '#34d399'
    roundRect(-8, groundY, W + 16, groundH + 20, 16)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(0, groundY, W, 3)

    // 主役（アイテム）。ready 中はふわふわ、飛行中は速度でチルト。
    const drawY = phase === 'ready' ? centerY + Math.sin(now / 300) * 8 : birdY
    // チルトは速度の絶対値ではなく落下上限に対する比で決める（vy が端末スケール依存になったため）。
    const tilt =
      phase === 'ready' ? 0 : Math.max(-0.35, Math.min(1.0, (vy / MAX_FALL) * 0.85))
    ctx.save()
    ctx.translate(birdX, drawY)
    ctx.rotate(tilt)
    ctx.shadowColor = 'rgba(0,0,0,0.22)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 3
    ctx.drawImage(sprite.img, -birdW / 2, -birdH / 2, birdW, birdH)
    ctx.restore()
  }

  const frame = (now: number) => {
    if (last < 0) last = now
    let elapsed = now - last
    last = now
    if (elapsed > 200) elapsed = FIXED_DT // タブ復帰等の巨大 dt は 1 ステップに丸める
    acc += elapsed
    let steps = 0
    while (acc >= FIXED_DT && steps < MAX_STEPS) {
      step()
      acc -= FIXED_DT
      steps += 1
    }
    if (steps >= MAX_STEPS) acc = 0
    render(now)
    raf = requestAnimationFrame(frame)
  }

  const flap = () => {
    if (phase === 'over') return
    if (phase === 'ready') phase = 'playing'
    vy = FLAP_VY
  }

  const restart = () => {
    columns.length = 0
    birdY = centerY
    vy = 0
    score = 0
    phase = 'ready'
    acc = 0
    cb.onScore(0)
  }

  const destroy = () => cancelAnimationFrame(raf)

  raf = requestAnimationFrame(frame)
  return { flap, restart, destroy }
}
