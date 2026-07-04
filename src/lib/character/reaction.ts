import type { FairyExpression } from './CharacterRenderer'

/**
 * 収集体験に対する妖精の感情リアクションを決める純関数（クライアント専用）。
 * 表示や状態管理からは独立させ、将来ホームの会話リアクションからも再利用できるようにする。
 * マッピングはチューニング前提でここに集約する（屋外目視で値を詰める）。
 */

/** 生成成功時（窯のアイテム化）のリアクション。新しいものが生まれた喜び＝わくわく。 */
export function emotionForGenerated(): FairyExpression {
  return 'excited'
}

/** 図鑑確定時のリアクション。新カテゴリ初取得なら大興奮、それ以外は素直に喜ぶ。 */
export function emotionForConfirm(isNewCategory: boolean): FairyExpression {
  return isNewCategory ? 'excited' : 'happy'
}
