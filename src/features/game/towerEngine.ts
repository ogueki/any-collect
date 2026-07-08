import type * as MatterNS from 'matter-js'
import { buildSpritePiece, type SpritePiece } from '../../lib/image/alphaShape'

/**
 * タワーバトル（オマケ・ソロ）の物理コア。matter.js を**遅延 import**（ここでだけ）して
 * 本体バンドルに載せない。React 非依存＝canvas とアイテムプールと callbacks を受けるだけ。
 *
 * 当たり判定＝透過アイテムのアルファ凸包（`alphaShape.buildSpritePiece`）。描画は Matter.Render を
 * 使わず**自前 rAF**で body.position / body.angle に画像を貼る（凸包の重心と画像中心のズレを
 * 描画オフセットで補正＝スプライトと当たりが正確に一致する）。
 */

export interface TowerItem {
  id: string
  iconUrl: string
  name: string
}

export interface TowerCallbacks {
  /** ドロップが盤面に乗るたび、現在の積み数を通知（ライブ表示用）。 */
  onScore: (stacked: number) => void
  /** 妖精リアクション（積んだ節目 / 崩壊）。 */
  onReaction: (kind: 'stack' | 'collapse') => void
  /** 場外落下＝ゲームオーバー（最終スコア＝積めた数）。 */
  onGameOver: (finalScore: number) => void
}

export interface TowerGameHandle {
  /** 落下待ちピースの横位置を clientX（画面座標）から狙う。 */
  aimAt: (clientX: number) => void
  /** 落下待ちピースを落とす。 */
  drop: () => void
  /** リスタート（盤面クリア＋最初のピース）。 */
  restart: () => void
  /** 破棄（rAF 停止・matter クリア）。 */
  destroy: () => void
}

interface Placed {
  body: MatterNS.Body
  piece: SpritePiece
}

/** 表示長辺 px をキャンバス幅から決める（小さすぎ/大きすぎを避ける）。 */
function pieceSizeFor(cssW: number): number {
  return Math.round(Math.min(96, Math.max(48, cssW * 0.2)))
}

export async function createTowerGame(
  canvas: HTMLCanvasElement,
  pool: TowerItem[],
  cb: TowerCallbacks,
): Promise<TowerGameHandle> {
  // matter.js を遅延ロード（CJS 相互運用＝default に本体が入る形も吸収）。
  const imported = await import('matter-js')
  const Matter =
    (imported as unknown as { default?: typeof MatterNS }).default ??
    (imported as unknown as typeof MatterNS)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d コンテキストを取得できませんでした')

  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
  const cssW = canvas.clientWidth || 360
  const cssH = canvas.clientHeight || 560
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)

  const W = cssW
  const H = cssH
  const size = pieceSizeFor(W)
  // 元ネタ（動物タワーバトル）流に、地面ではなく**せまい台座**。端から落ちたら負け。
  const PLATFORM_H = 22
  const platformW = Math.round(Math.min(W - 48, Math.max(120, W * 0.44)))
  const platformX = W / 2
  const platformTopY = Math.round(H * 0.72)
  const dropY = 64 // 落下待ちピースの y

  // 事前に全アイテムの凸包＋画像を用意（落とす瞬間を同期に）。失敗は握りつぶし除外。
  const built: SpritePiece[] = []
  await Promise.all(
    pool.map(async (it) => {
      try {
        built.push(await buildSpritePiece(it.iconUrl, size))
      } catch {
        // このアイテムはプールから外れるだけ。
      }
    }),
  )

  const engine = Matter.Engine.create()
  engine.gravity.y = 1
  const world = engine.world
  const platform = Matter.Bodies.rectangle(
    platformX,
    platformTopY + PLATFORM_H / 2,
    platformW,
    PLATFORM_H,
    { isStatic: true, friction: 0.9, chamfer: { radius: 6 } },
  )
  Matter.Composite.add(world, platform)

  const placed: Placed[] = []
  let pending: SpritePiece | null = null
  let pendingX = W / 2
  let placedCount = 0
  let over = false
  let raf = 0
  let last = performance.now()

  const pickPiece = (): SpritePiece | null =>
    built.length ? built[Math.floor(Math.random() * built.length)] : null

  const spawnPending = () => {
    pending = pickPiece()
    pendingX = W / 2
  }

  const makeBody = (piece: SpritePiece, x: number, y: number): MatterNS.Body => {
    const opts: MatterNS.IChamferableBodyDefinition = {
      friction: 0.6,
      frictionStatic: 0.8,
      restitution: 0.02,
    }
    if (piece.vertices && piece.vertices.length >= 3) {
      const body = Matter.Bodies.fromVertices(x, y, [piece.vertices], opts)
      // fromVertices はまれに空を返す（分解失敗）。その時は矩形へ。
      if (body && body.area > 0) return body
    }
    return Matter.Bodies.rectangle(x, y, piece.width * 0.82, piece.height * 0.82, opts)
  }

  const drop = () => {
    if (over || !pending) return
    const piece = pending
    pending = null
    const body = makeBody(piece, pendingX, dropY)
    Matter.Composite.add(world, body)
    placed.push({ body, piece })
    placedCount += 1
    cb.onScore(placedCount)
    if (placedCount % 3 === 0) cb.onReaction('stack')
    // 次のピースを即用意（プレイヤーが待つのは自由＝タワーバトルらしさ）。
    spawnPending()
  }

  const aimAt = (clientX: number) => {
    if (over) return
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const margin = size * 0.6
    pendingX = Math.min(W - margin, Math.max(margin, x))
  }

  const outOfBounds = (b: MatterNS.Body): boolean =>
    b.position.y > H + 120 || b.position.x < -120 || b.position.x > W + 120

  const checkFalls = () => {
    if (over) return
    for (const p of placed) {
      if (outOfBounds(p.body)) {
        over = true
        cb.onReaction('collapse')
        cb.onGameOver(Math.max(0, placedCount - 1))
        return
      }
    }
  }

  // 画像を body に貼って描く（重心オフセット補正で当たりと一致）。
  const drawPiece = (piece: SpritePiece, x: number, y: number, angle: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    // body.position＝凸包重心。画像中心は重心から -centroid の位置。
    ctx.drawImage(
      piece.img,
      -piece.centroid.x - piece.width / 2,
      -piece.centroid.y - piece.height / 2,
      piece.width,
      piece.height,
    )
    ctx.restore()
  }

  const render = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    // せまい台座（端から落ちたら負け）＋装飾の支柱。
    const px = platformX - platformW / 2
    ctx.fillStyle = 'rgba(120, 113, 108, 0.35)'
    ctx.fillRect(platformX - platformW * 0.13, platformTopY + PLATFORM_H, platformW * 0.26, H)
    ctx.fillStyle = 'rgba(120, 113, 108, 0.92)'
    ctx.fillRect(px, platformTopY, platformW, PLATFORM_H)

    // 積まれたピース。
    for (const p of placed) {
      drawPiece(p.piece, p.body.position.x, p.body.position.y, p.body.angle)
    }

    // 落下待ちピース（狙いガイド＋本体）。
    if (pending && !over) {
      ctx.save()
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'
      ctx.setLineDash([4, 6])
      ctx.beginPath()
      ctx.moveTo(pendingX, dropY)
      ctx.lineTo(pendingX, platformTopY)
      ctx.stroke()
      ctx.restore()
      drawPiece(pending, pendingX, dropY, 0)
    }
  }

  const frame = (now: number) => {
    const dt = Math.min(32, now - last)
    last = now
    Matter.Engine.update(engine, dt)
    render()
    checkFalls()
    raf = requestAnimationFrame(frame)
  }

  const restart = () => {
    for (const p of placed) Matter.Composite.remove(world, p.body)
    placed.length = 0
    placedCount = 0
    over = false
    cb.onScore(0)
    spawnPending()
  }

  const destroy = () => {
    cancelAnimationFrame(raf)
    Matter.Composite.clear(world, false)
    Matter.Engine.clear(engine)
  }

  spawnPending()
  raf = requestAnimationFrame(frame)

  return { aimAt, drop, restart, destroy }
}
