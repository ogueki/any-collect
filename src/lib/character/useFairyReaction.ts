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
  // nonce が変わるたびにポーズを引き直し、一発アニメをリスタートする。
  const [reaction, setReaction] = useState<{ expression: FairyExpression; nonce: number } | null>(
    null,
  )

  const fire = useCallback((expression: FairyExpression) => {
    setReaction((prev) => ({ expression, nonce: (prev?.nonce ?? 0) + 1 }))
  }, [])

  // リアクションは一定時間で消えてベース表情に戻る。
  useEffect(() => {
    if (!reaction) return
    const timer = setTimeout(() => setReaction(null), durationMs)
    return () => clearTimeout(timer)
  }, [reaction, durationMs])

  return {
    expression: reaction?.expression,
    animateKey: reaction?.nonce,
    fire,
  }
}
