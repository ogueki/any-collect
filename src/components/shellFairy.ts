import { createContext, useContext } from 'react'
import type { FairyExpression } from '../lib/character/CharacterRenderer'

/**
 * 作業画面（WorkingScreen）の右下コレットに感情リアクションを飛ばすための共有ハンドル。
 * Provider は `WorkingScreen` が張り、子ビュー（`CollectionView`/`KilnView` 等）が
 * `useShellFairy().fire(emotion)` で反応させる。シェル外で使うと no-op。
 * （context/hook を component ファイルから分けるのは react-refresh の制約のため。）
 */
export type ShellFairy = { fire: (emotion: FairyExpression) => void }

export const ShellFairyContext = createContext<ShellFairy>({ fire: () => {} })

export function useShellFairy(): ShellFairy {
  return useContext(ShellFairyContext)
}
