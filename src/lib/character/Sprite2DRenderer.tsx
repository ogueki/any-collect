import type { FairyExpression, FairyViewProps } from './CharacterRenderer'

/**
 * 2D スプライトによる妖精表示（CharacterRenderer 実装）。
 *
 * 各キャラの画像は `src/characters/<id>/sprites/<expression>.png` に置く。
 * 画像が未配置の場合はプレースホルダー（絵文字）を表示するので、
 * イラストが用意できる前でも開発を進められる。
 * 将来は同じ FairyViewProps で Live2D / 3D 実装に差し替え可能。
 */

// 全キャラの sprites/*.png を URL として取り込む（存在する分だけマッチ）。
// ⚠️ 絶対パターン('/src/...')は Windows＋非ASCIIパスでキー変換が壊れるため、相対パターンを使う。
const spriteModules = import.meta.glob('../../characters/*/sprites/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function resolveSprite(
  characterId: string,
  expression: FairyExpression,
): string | undefined {
  const base = `../../characters/${characterId}/sprites`
  // 指定表情が無ければ neutral にフォールバック
  return spriteModules[`${base}/${expression}.png`] ?? spriteModules[`${base}/neutral.png`]
}

const SIZE_CLASS: Record<NonNullable<FairyViewProps['size']>, string> = {
  sm: 'h-20 w-20',
  lg: 'h-44 w-44',
}

export default function Sprite2DRenderer({
  characterId,
  expression,
  size = 'lg',
}: FairyViewProps) {
  const url = resolveSprite(characterId, expression)

  if (!url) {
    return (
      <div
        className={`flex ${SIZE_CLASS[size]} items-center justify-center rounded-full bg-white/70 shadow-pop`}
        role="img"
        aria-label="妖精（イラスト準備中）"
      >
        <span className={size === 'lg' ? 'text-6xl' : 'text-4xl'} aria-hidden>
          🧚
        </span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt="妖精"
      draggable={false}
      className={`${SIZE_CLASS[size]} select-none object-contain drop-shadow-[0_8px_16px_rgba(196,181,253,0.5)]`}
    />
  )
}
