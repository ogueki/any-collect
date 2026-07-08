import type * as MatterNS from 'matter-js'
import { buildSpritePiece, type SpritePiece } from '../../lib/image/alphaShape'

/**
 * タワーバトル（オマケ）の物理コア。matter.js を**遅延 import**（ここでだけ）して
 * 本体バンドルに載せない。React 非依存＝canvas とアイテムプールと callbacks を受けるだけ。
 *
 * 当たり判定＝透過アイテムのアルファ凸包（`alphaShape.buildSpritePiece`）。描画は Matter.Render を
 * 使わず**自前 rAF**で body.position / body.angle に画像を貼る（凸包の重心と画像中心のズレを
 * 描画オフセットで補正＝スプライトと当たりが正確に一致する）。
 *
 * 2モード：`solo`＝エンドレスに積んで場外落下で終了（積めた数がスコア）。
 * `vs`＝コレットと交互ターン。落とした一手で場外落下が起きたら、その手番の側が負け
 * （物理・崩壊検知はソロと同一コア／VS はターン管理＋簡単AI を上に乗せた増分）。
 */

export interface TowerItem {
  id: string
  iconUrl: string
  name: string
}

export type TurnActor = 'player' | 'colette'

export type TowerResult =
  | { mode: 'solo'; stacked: number }
  | { mode: 'vs'; winner: TurnActor; stacked: number }

export interface TowerCallbacks {
  /** ドロップが盤面に乗るたび、現在の積み数を通知（ライブ表示用）。 */
  onScore: (stacked: number) => void
  /** 妖精リアクション（積んだ節目 / 崩壊）。 */
  onReaction: (kind: 'stack' | 'collapse') => void
  /** VS：手番が変わったら通知。 */
  onTurn?: (turn: TurnActor) => void
  /** 終了（solo＝積めた数／vs＝勝者）。 */
  onGameOver: (result: TowerResult) => void
}

export interface TowerOptions {
  mode?: 'solo' | 'vs'
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

/** VS：落としたピースが「落ち着いた」と見なす速度としきい。 */
const SETTLE_SPEED = 0.35
const SETTLE_ANGULAR = 0.05
const SETTLE_MIN_MS = 500
const SETTLE_TIMEOUT_MS = 3000
/** VS：コレットの手番の「考える間」と狙いを動かす時間、外し幅。 */
const AI_THINK_MS = 700
const AI_MOVE_MS = 650

/** 表示長辺 px をキャンバス幅から決める（小さすぎ/大きすぎを避ける）。 */
function pieceSizeFor(cssW: number): number {
  return Math.round(Math.min(96, Math.max(48, cssW * 0.2)))
}

export async function createTowerGame(
  canvas: HTMLCanvasElement,
  pool: TowerItem[],
  cb: TowerCallbacks,
  opts?: TowerOptions,
): Promise<TowerGameHandle> {
  const mode = opts?.mode ?? 'solo'
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
  const AI_NOISE = size * 0.7
  // 元ネタ（動物タワーバトル）流に、地面ではなく**せまい台座**。端から落ちたら負け。
  const PLATFORM_H = 22
  const platformW = Math.round(Math.min(W - 32, Math.max(170, W * 0.7)))
  const platformX = W / 2
  const platformTopY = Math.round(H * 0.72)
  const dropY = 64 // 落下待ちピースの y
  const aimMargin = size * 0.6

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

  // VS 用の状態。
  let turn: TurnActor = 'player'
  let phase: 'aiming' | 'settling' = 'aiming'
  let lastDropper: TurnActor = 'player'
  let settleStart = 0
  let aiState: { from: number; to: number; start: number; dur: number } | null = null

  const pickPiece = (): SpritePiece | null =>
    built.length ? built[Math.floor(Math.random() * built.length)] : null

  const spawnPending = () => {
    pending = pickPiece()
    pendingX = W / 2
  }

  const makeBody = (piece: SpritePiece, x: number, y: number): MatterNS.Body => {
    const bodyOpts: MatterNS.IChamferableBodyDefinition = {
      friction: 0.9,
      frictionStatic: 1.0,
      restitution: 0, // 跳ねない＝転がって落ちにくく
      frictionAir: 0.02, // わずかな空気抵抗で無限にコロコロしない
    }
    if (piece.vertices && piece.vertices.length >= 3) {
      const body = Matter.Bodies.fromVertices(x, y, [piece.vertices], bodyOpts)
      // fromVertices はまれに空を返す（分解失敗）。その時は矩形へ。
      if (body && body.area > 0) return body
    }
    return Matter.Bodies.rectangle(x, y, piece.width * 0.82, piece.height * 0.82, bodyOpts)
  }

  // ピースを実際に落として盤面に加える（共通処理）。
  const doDrop = () => {
    if (!pending) return
    const piece = pending
    pending = null
    const body = makeBody(piece, pendingX, dropY)
    Matter.Composite.add(world, body)
    placed.push({ body, piece })
    placedCount += 1
    cb.onScore(placedCount)
    if (placedCount % 3 === 0) cb.onReaction('stack')
  }

  const beginSettling = () => {
    phase = 'settling'
    settleStart = performance.now()
  }

  // VS：手番を切り替える（落ち着いた後）。
  const endTurn = () => {
    turn = turn === 'player' ? 'colette' : 'player'
    phase = 'aiming'
    cb.onTurn?.(turn)
    spawnPending()
    if (turn === 'colette') scheduleAi()
  }

  // VS：コレットの狙いを決める（現在の山の重心 ± ノイズ）→ フレームループで動かして落とす。
  const scheduleAi = () => {
    const pileX = placed.length
      ? placed.reduce((s, p) => s + p.body.position.x, 0) / placed.length
      : platformX
    const noise = (Math.random() * 2 - 1) * AI_NOISE
    const target = Math.min(W - aimMargin, Math.max(aimMargin, pileX + noise))
    aiState = { from: W / 2, to: target, start: performance.now() + AI_THINK_MS, dur: AI_MOVE_MS }
  }

  const drop = () => {
    if (over) return
    if (mode === 'solo') {
      if (!pending) return
      doDrop()
      spawnPending() // ソロは即・次のピース（連続で落とせる）
      return
    }
    // VS：プレイヤーの手番で狙い中のときだけ。
    if (turn !== 'player' || phase !== 'aiming' || !pending) return
    lastDropper = 'player'
    doDrop()
    beginSettling()
  }

  const coletteDrop = () => {
    if (over || !pending) return
    lastDropper = 'colette'
    doDrop()
    beginSettling()
  }

  const aimAt = (clientX: number) => {
    if (over) return
    if (mode === 'vs' && (turn !== 'player' || phase !== 'aiming')) return
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    pendingX = Math.min(W - aimMargin, Math.max(aimMargin, x))
  }

  const outOfBounds = (b: MatterNS.Body): boolean =>
    b.position.y > H + 120 || b.position.x < -120 || b.position.x > W + 120

  const checkFalls = () => {
    if (over) return
    for (const p of placed) {
      if (!outOfBounds(p.body)) continue
      over = true
      if (mode === 'solo') {
        cb.onReaction('collapse')
        cb.onGameOver({ mode: 'solo', stacked: Math.max(0, placedCount - 1) })
      } else {
        // 落とした手番の側が負け＝相手の勝ち。
        const winner: TurnActor = lastDropper === 'player' ? 'colette' : 'player'
        cb.onGameOver({ mode: 'vs', winner, stacked: Math.max(0, placedCount - 1) })
      }
      return
    }
  }

  // VS：落としたピースが落ち着いたら手番交代／コレットの手番なら狙って落とす。
  const updateTurns = (now: number) => {
    if (mode !== 'vs' || over) return
    if (phase === 'settling') {
      const lastBody = placed[placed.length - 1]?.body
      const elapsed = now - settleStart
      const resting =
        !!lastBody && lastBody.speed < SETTLE_SPEED && lastBody.angularSpeed < SETTLE_ANGULAR
      if ((elapsed > SETTLE_MIN_MS && resting) || elapsed > SETTLE_TIMEOUT_MS) endTurn()
      return
    }
    if (turn === 'colette' && aiState) {
      const t = now - aiState.start
      if (t < 0) return // 考え中
      if (t < aiState.dur) {
        pendingX = aiState.from + (aiState.to - aiState.from) * (t / aiState.dur)
      } else {
        pendingX = aiState.to
        aiState = null
        coletteDrop()
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

    // 落下待ちピース（狙いガイド＋本体）。VS のコレット手番も aiming なので同様に見える。
    if (pending && !over) {
      // コレットの手番はガイド色を変えて「相手が狙ってる」感を出す。
      const coletteAiming = mode === 'vs' && turn === 'colette'
      ctx.save()
      ctx.strokeStyle = coletteAiming ? 'rgba(167, 139, 250, 0.6)' : 'rgba(148, 163, 184, 0.5)'
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
    updateTurns(now)
    render()
    checkFalls()
    raf = requestAnimationFrame(frame)
  }

  const resetState = () => {
    for (const p of placed) Matter.Composite.remove(world, p.body)
    placed.length = 0
    placedCount = 0
    over = false
    aiState = null
    turn = 'player'
    phase = 'aiming'
    lastDropper = 'player'
    cb.onScore(0)
    spawnPending()
    if (mode === 'vs') cb.onTurn?.('player')
  }

  const restart = () => resetState()

  const destroy = () => {
    cancelAnimationFrame(raf)
    Matter.Composite.clear(world, false)
    Matter.Engine.clear(engine)
  }

  spawnPending()
  if (mode === 'vs') cb.onTurn?.('player')
  raf = requestAnimationFrame(frame)

  return { aimAt, drop, restart, destroy }
}
