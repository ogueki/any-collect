import type { Rarity } from '../../types'
import type { GeneratedItem } from '../ai/imageProvider'
import type { FairyExpression } from './CharacterRenderer'

/**
 * 収集体験に対する妖精の感情リアクションを決める純関数（クライアント専用）。
 * 表示や状態管理からは独立させ、将来ホームの会話リアクションからも再利用できるようにする。
 * マッピングはチューニング前提でここに集約する（屋外目視で値を詰める）。
 */

// レア度 → 感情。未指定（メタ生成がレア度を返さない）場合は happy にフォールバック。
const RARITY_EMOTION: Record<Rarity, FairyExpression> = {
  common: 'happy',
  uncommon: 'happy',
  rare: 'surprised',
  epic: 'excited',
  legendary: 'excited',
}

/** 生成成功時のリアクション（レア度に応じて喜ぶ／驚く）。 */
export function emotionForGenerated(item: GeneratedItem): FairyExpression {
  return item.rarity ? RARITY_EMOTION[item.rarity] : 'happy'
}

/** 図鑑確定時のリアクション。新カテゴリ初取得なら大興奮、それ以外は素直に喜ぶ。 */
export function emotionForConfirm(isNewCategory: boolean): FairyExpression {
  return isNewCategory ? 'excited' : 'happy'
}
