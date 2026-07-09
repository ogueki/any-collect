import { buildSpritePiece } from '../../lib/image/alphaShape'

/**
 * フラッピー風ゲーム（オマケ②）の物理＋描画コア。React 非依存＝canvas と主役アイテムと
 * callbacks を受けるだけ。matter.js は不要（重力＋タップで上昇の素朴なループ）。
 *
 * **固定タイムステップ**で更新する（タワーバトルの実機バグ＝可変 dt で挙動が乱れる教訓を最初から適用）。
 * 実フレーム間隔が乱れても 1 ステップ = 1000/60ms 固定で進め、フレーム飛びは複数ステップで追いつく。
 *
 * 主役＝集めた透過アイテム（`buildSpritePiece` で読み込み・当たりは寛容な矩形）。障害物＝妖精界トーンの
 * パステルな柱（上下に隙間）。当たり or 地面で終了、くぐった数がスコア。
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

// 以下はすべて「1 固定ステップ(1/60秒)あたり」の単位。固定 dt なのでフレームレート非依存。
const GRAVITY = 0.5 // 毎ステップ vy に加算
const FLAP_VY = -8.2 // はばたきで vy をこの値に
const MAX_FALL = 12 // 落下速度の上限
const SCROLL = 2.4 // 柱が左へ流れる速さ（px/ステップ）
const MILESTONE = 5 // この数くぐるごとに excited

/** 主役の表示長辺 px（画面幅から。小さすぎ/大きすぎを避ける）。 */
function birdSizeFor(cssW: number): number {
  return Math.round(Math.min(60, Math.max(42, cssW * 0.14)))
}

interface Column {
  x: number // 柱の中心 x
  gapCenter: number // 隙間の中心 y
  passed: boolean
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
  const colW = Math.max(46, Math.round(W * 0.15))
  const spacing = Math.max(190, Math.round(W * 0.66))
  const GAP = Math.max(155, Math.round(birdSize * 3.1)) // 隙間（寛容め）
  const firstX = W + colW // 最初の柱は画面右外から
  const centerY = groundY / 2

  // 主役の画像を読み込む（透過アイテムの data URL＝canvas 安全）。凸包は使わず img/寸法だけ使う。
  const sprite = await buildSpritePiece(item.iconUrl, birdSize)
  const birdW = sprite.width
  const birdH = sprite.height
  // 当たりは寛容（見た目より小さめの矩形）＝フラッピーの気持ちよさ。
  const hitHW = birdW * 0.3
  const hitHH = birdH * 0.3

  const columns: Column[] = []
  let birdY = centerY
  let vy = 0
  let score = 0
  let phase: 'ready' | 'playing' | 'over' = 'ready'
  let raf = 0
  let last = -1 // 初回フレームで rAF の now に揃える（時計の混在＝初回巨大 dt を避ける）
  let acc = 0

  const randGapCenter = (): number => {
    const top = GAP / 2 + 44
    const bottom = groundY - GAP / 2 - 20
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
    const top = birdY - hitHH
    const bottom = birdY + hitHH
    const left = birdX - hitHW
    const right = birdX + hitHW
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
    if (birdY - hitHH < 0) {
      birdY = hitHH
      if (vy < 0) vy = 0
    }
    // 地面は墜落。
    if (birdY + hitHH >= groundY) {
      birdY = groundY - hitHH
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
    const tilt =
      phase === 'ready' ? 0 : Math.max(-0.35, Math.min(1.0, vy * 0.06))
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
