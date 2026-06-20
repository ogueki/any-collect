import { useMemo } from 'react'
import type { FairyExpression, FairyViewProps } from './CharacterRenderer'

/**
 * 2D スプライトによる妖精表示（CharacterRenderer 実装）。
 *
 * 各キャラの画像は以下のどちらの置き方でも読み込める：
 *   - `src/characters/<id>/sprites/<emotion>/<任意>.png` … 1感情に何枚でも（推奨）
 *   - `src/characters/<id>/sprites/<emotion>.png`        … 1感情1枚（後方互換）
 * 同一感情に複数あれば毎回ランダムに選び、連続で同じ絵は出さない（飽き対策）。
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

// characterId → emotion → 候補URL配列 の索引を一度だけ構築する。
type SpriteIndex = Record<string, Record<string, string[]>>

const spriteIndex: SpriteIndex = (() => {
  const index: SpriteIndex = {}
  for (const [path, url] of Object.entries(spriteModules)) {
    // 例: ../../characters/default/sprites/happy/a.png → id=default, rest=happy/a
    //     ../../characters/default/sprites/neutral.png → id=default, rest=neutral
    const m = path.match(/\/characters\/([^/]+)\/sprites\/(.+)\.png$/)
    if (!m) continue
    const characterId = m[1]
    const rest = m[2]
    const slash = rest.indexOf('/')
    // フォルダ配下ならフォルダ名が感情、直置きならファイル名（末尾の -1 等は除く）が感情。
    const emotion = slash >= 0 ? rest.slice(0, slash) : rest.replace(/-\d+$/, '')
    const byEmotion = (index[characterId] ??= {})
    ;(byEmotion[emotion] ??= []).push(url)
  }
  return index
})()

/** 指定キャラ・感情の候補URL配列。無ければ neutral にフォールバック。 */
function resolveSprites(characterId: string, expression: FairyExpression): string[] {
  const byEmotion = spriteIndex[characterId]
  if (!byEmotion) return []
  return byEmotion[expression] ?? byEmotion.neutral ?? []
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
}: FairyViewProps) {
  // animateKey が変わるたびに引き直す（リアクション発火ごとに別ポーズ）。
  const url = useMemo(() => {
    void animateKey
    const urls = resolveSprites(characterId, expression)
    return urls.length > 0 ? pickSprite(urls, `${characterId}/${expression}`) : undefined
  }, [characterId, expression, animateKey])

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
