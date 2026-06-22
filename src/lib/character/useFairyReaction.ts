import { useCallback, useEffect, useState } from 'react'
import type { FairyExpression } from './CharacterRenderer'

/**
 * 妖精の「一時リアクション」を扱う共有フック。
 *
 * どの文脈（カメラの生成/確定・ホームの会話・将来の風景コメント/妖精の窯など）でも、
 * `fire(emotion)` を呼べば一定時間その表情に切り替わり、`animateKey` が変わって
 * 一発アニメ（`Sprite2DRenderer` の `REACTION_ANIMATION`）が再生され、`durationMs` 後に
 * 自動でベース表情へ戻る。
 *
 * 「どの感情にするか（選定）」は文脈ごとに違う（アイテム=`reaction.ts` の決定ルール／
 * 会話=AI が responseSchema で選ぶ）ので、このフックは扱わない。ここは「発火」だけを共通化する。
 *
 * 使い方：
 *   const { expression: reactionExpr, animateKey, fire } = useFairyReaction()
 *   // 何か起きたら fire('happy') 等
 *   <Sprite2DRenderer expression={reactionExpr ?? baseExpression} animateKey={animateKey} />
 */

const DEFAULT_DURATION_MS = 2500

export interface FairyReaction {
  /** リアクション中の表情。リアクションしていなければ undefined（呼び出し側のベース表情を使う）。 */
  expression: FairyExpression | undefined
  /** `Sprite2DRenderer` に渡す `animateKey`。発火のたびに変わり一発アニメをリスタートする。 */
  animateKey: number | undefined
  /** 一時リアクションを発火する。`durationMs` 後にベース表情へ戻る。 */
  fire: (expression: FairyExpression) => void
}

export function useFairyReaction(durationMs: number = DEFAULT_DURATION_MS): FairyReaction {
  // 一時的な表情オーバーレイ。durationMs 後に消えてベース表情へ戻る。
  const [expression, setExpression] = useState<FairyExpression | undefined>(undefined)
  // 発火ごとに単調増加するキー（アニメ再生＆ポーズ選び直しのトリガー）。
  // 重要: リアクション終了時に undefined へ戻さない。戻すと「同じ表情のまま別ポーズへ
  // 引き直し」が起きてしまう（バグ：surprised が時間経過で別の絵に切り替わる）。
  const [animateKey, setAnimateKey] = useState<number | undefined>(undefined)

  const fire = useCallback((next: FairyExpression) => {
    setExpression(next)
    setAnimateKey((k) => (k ?? 0) + 1)
  }, [])

  // 発火から durationMs 後に表情オーバーレイだけ消す（animateKey は据え置き）。
  useEffect(() => {
    if (animateKey === undefined) return
    const timer = setTimeout(() => setExpression(undefined), durationMs)
    return () => clearTimeout(timer)
  }, [animateKey, durationMs])

  return { expression, animateKey, fire }
}
