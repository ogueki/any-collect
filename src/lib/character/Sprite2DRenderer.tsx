import { useMemo } from 'react'
import type { FairyExpression, FairyViewProps } from './CharacterRenderer'

/**
 * 2D スプライトによる妖精表示（CharacterRenderer 実装）。
 *
 * 画像は以下の置き方を混在できる：
 *   - `sprites/<emotion>/lv1/<任意>.png` … 好感度レベル別（lv1, lv2, …）
 *   - `sprites/<emotion>/<任意>.png`     … レベル共通（1感情に何枚でも・推奨）
 *   - `sprites/<emotion>.png`            … 1感情1枚（後方互換）
 * 同一バケツに複数あれば毎回ランダムに選び、連続で同じ絵は出さない（飽き対策）。
 * レベル指定時は lv{level} を優先し、無ければ下位レベル→共通→neutral へフォールバック。
 * 画像が未配置でもプレースホルダー（絵文字）で動く。
 * 将来は同じ FairyViewProps で Live2D / 3D 実装に差し替え可能。
 */

// 全キャラの sprites 配下 *.png を URL として取り込む（存在する分だけマッチ）。
// ⚠️ 絶対パターン('/src/...')は Windows＋非ASCIIパスでキー変換が壊れるため、相対パターンを使う。
const spriteModules = import.meta.glob('../../characters/*/sprites/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

// レベルサブフォルダを持たない素材を入れる既定 tier キー。
const NO_TIER = '_'

// characterId → emotion → tier → 候補URL配列 の索引を一度だけ構築する。
type SpriteIndex = Record<string, Record<string, Record<string, string[]>>>

const spriteIndex: SpriteIndex = (() => {
  const index: SpriteIndex = {}
  for (const [path, url] of Object.entries(spriteModules)) {
    const m = path.match(/\/characters\/([^/]+)\/sprites\/(.+)\.png$/)
    if (!m) continue
    const characterId = m[1]
    const segs = m[2].split('/')
    // セグメント数で (emotion, tier) を判定：
    //   neutral                → emotion=neutral(末尾-N除去), tier=共通
    //   happy/a                → emotion=happy,               tier=共通
    //   embarrassed/lv1/a      → emotion=embarrassed,         tier=lv1
    let emotion: string
    let tier: string
    if (segs.length === 1) {
      emotion = segs[0].replace(/-\d+$/, '')
      tier = NO_TIER
    } else if (segs.length === 2) {
      emotion = segs[0]
      tier = NO_TIER
    } else {
      emotion = segs[0]
      tier = segs[1]
    }
    const byEmotion = (index[characterId] ??= {})
    const byTier = (byEmotion[emotion] ??= {})
    ;(byTier[tier] ??= []).push(url)
  }
  return index
})()

/**
 * 指定キャラ・感情・好感度レベルの候補URL配列を返す。
 * lv{level} → 下位レベル → 共通(tierなし) → neutral の順にフォールバックする。
 */
function resolveSprites(
  characterId: string,
  expression: FairyExpression,
  level: number,
): string[] {
  const byEmotion = spriteIndex[characterId]
  if (!byEmotion) return []

  const pickFromTiers = (byTier: Record<string, string[]> | undefined): string[] | undefined => {
    if (!byTier) return undefined
    for (let l = level; l >= 1; l--) {
      const t = byTier[`lv${l}`]
      if (t?.length) return t
    }
    return byTier[NO_TIER]?.length ? byTier[NO_TIER] : undefined
  }

  return pickFromTiers(byEmotion[expression]) ?? pickFromTiers(byEmotion.neutral) ?? []
}

// 「直前に出したindex」を感情ごとに記憶し、連続で同じ絵を出さない（シャッフルバッグ的）。
const lastPicked = new Map<string, number>()

function pickSprite(urls: string[], key: string): string {
  if (urls.length <= 1) return urls[0]
  const prev = lastPicked.get(key)
  let idx = Math.floor(Math.random() * urls.length)
  if (idx === prev) idx = (idx + 1) % urls.length
  lastPicked.set(key, idx)
  return urls[idx]
}

const SIZE_CLASS: Record<NonNullable<FairyViewProps['size']>, string> = {
  sm: 'h-20 w-20',
  lg: 'h-44 w-44',
}

// 感情ごとの「リアクション時に1回だけ」再生するアニメ。neutral は動かさない。
const REACTION_ANIMATION: Partial<Record<FairyExpression, string>> = {
  happy: 'animate-pop',
  excited: 'animate-pop',
  surprised: 'animate-shake',
  thinking: 'animate-wiggle',
  sad: 'animate-droop',
}

export default function Sprite2DRenderer({
  characterId,
  expression,
  size = 'lg',
  animateKey,
  level = 1,
}: FairyViewProps) {
  // animateKey が変わるたびに引き直す（リアクション発火ごとに別ポーズ）。
  const url = useMemo(() => {
    void animateKey
    const urls = resolveSprites(characterId, expression, level)
    return urls.length > 0 ? pickSprite(urls, `${characterId}/${expression}`) : undefined
  }, [characterId, expression, level, animateKey])

  // 一発アニメはリアクション発火時（animateKey 指定時）のみ。key で毎回リスタート。
  const reactionAnim = animateKey !== undefined ? REACTION_ANIMATION[expression] : undefined

  return (
    // 外側ラッパは常時フワフワ浮遊（idle の生命感）。
    <div className={`${SIZE_CLASS[size]} animate-float`}>
      {url ? (
        <img
          key={animateKey}
          src={url}
          alt="妖精"
          draggable={false}
          className={`h-full w-full select-none object-contain drop-shadow-[0_8px_16px_rgba(196,181,253,0.5)] ${reactionAnim ?? ''}`}
        />
      ) : (
        <div
          key={animateKey}
          className={`flex h-full w-full items-center justify-center rounded-full bg-white/70 shadow-pop ${reactionAnim ?? ''}`}
          role="img"
          aria-label="妖精（イラスト準備中）"
        >
          <span className={size === 'lg' ? 'text-6xl' : 'text-4xl'} aria-hidden>
            🧚
          </span>
        </div>
      )}
    </div>
  )
}
