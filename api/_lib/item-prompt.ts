/**
 * アイテム生成の「絵柄統一」を一手に担うプロンプト定義。
 * 撮影アイテム化・将来の合成（窯）を含む “すべてのアイテム画像生成” がここを
 * 唯一の基準にすることで、コレクション全体の画風を揃える
 * （spec.md 4.1「全生成で共通のアートスタイル指定＝プロンプト＋アイコン枠/構図のテンプレ」）。
 *
 * ⚠️ STEP3 の最大の不確実性は「絵柄の統一感」。チューニングはこのファイルに集約する。
 * 将来、画風をキャラの世界観に紐づけたくなったら
 * `src/characters/<id>/art-style.md` を読んでオーバーライドする形に拡張できる。
 *
 * `_` 接頭辞ディレクトリは Vercel のルーティング対象外（＝import 専用）。
 */

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const
export type Rarity = (typeof RARITIES)[number]
export const RARITY_VALUES: readonly Rarity[] = RARITIES

/**
 * 全アイテム共通のアートスタイル＆構図テンプレ。英語で書くのは画像モデルの追従が良いため。
 * 「同じ1セットのゲームアイコンに見える」ことを最優先に、毎回同じ枠・同じ画風を強制する。
 */
const ART_STYLE_BLOCK = `RENDERING STYLE (MUST be identical for every item so the whole collection looks like one matching set):
- Clean hand-drawn anime / game illustration with one bold, even dark outline around the object.
- Soft cel shading with 2-3 light steps, gentle top-left light source, soft ambient occlusion, a subtle glossy highlight.
- Vibrant yet slightly pastel colors that stay true to the real object's actual colors.
- Light stylization only. Keep natural, realistic proportions — do NOT chibi-fy, round-off, or exaggerate the shape.

COMPOSITION (icon template, IDENTICAL every time):
- Exactly one single object, centered, slight 3/4 view, occupying about 75% of the frame.
- Square 1:1 framing.
- Background: a smooth soft pastel radial gradient inside a subtle rounded badge, very simple, no scenery, no environment, no extra objects.
- A soft drop shadow beneath the object.
- No watermarks, borders, UI, or hands. Keep only the text/logos physically printed on the object; do NOT add any new text, letters, or numbers.`

/**
 * SDXL / Lightning 系（fal の高速 img2img）で効くネガティブプロンプト。
 * ART_STYLE_BLOCK の「足すな」系ルールを、自然文追従の弱いモデル向けに語句で補強する。
 * 自然文追従の良い FLUX 系では空でも構わない（generate-item.ts のプロバイダ次第で渡す）。
 */
export const ITEM_NEGATIVE_PROMPT =
  'text, letters, numbers, watermark, signature, border, frame, UI, hands, ' +
  'extra objects, multiple objects, background scenery, environment, props, ' +
  'person, face, eyes, character, creature, mascot, ' +
  'added ornaments, jewels, ribbons, swirls, glow, ' +
  'chibi, deformed, distorted proportions, blurry, lowres, jpeg artifacts'

/**
 * 撮影写真 → 統一絵柄アイテムアイコン の画像生成プロンプト。
 * 「写真の実物を、見分けはつくまま、このアプリのアイテムに作り変える」よう指示する。
 */
export function buildItemImagePrompt(): string {
  return [
    'Redraw the main real-world object in the provided photo as a single collectible game item icon.',
    'This is a restyle of a REAL object, not a new design — illustrate what is actually in the photo.',
    '',
    'FIDELITY (most important):',
    '- Stay faithful to the actual object: keep its real shape, proportions, structure, materials and colors, and any label/branding visible in the photo.',
    "- Do NOT invent or add anything that is not in the photo: no extra ornaments, patterns, engravings, jewels, swirls, ribbons, glow, mascots, faces, eyes, characters, creatures, food, or background props.",
    '- Never turn the object into a person or character. A can stays a plain can; a box stays a box — just illustrated in the style below.',
    '',
    ART_STYLE_BLOCK,
  ].join('\n')
}

/**
 * 写真 → アイテム名/説明/カテゴリ/レア度 を作る際の system prompt。
 * 口調・世界観は選択中キャラの persona を唯一の基準にする（claude.md 原則3）。
 */
export function buildItemMetaPrompt(personaText: string): string {
  return [
    'あなたは以下のペルソナを持つ妖精です。',
    '渡された写真に写っている現実のモノを、ファンタジー世界の「収集アイテム」に見立てて、名前と説明を考えます。',
    '',
    '出力ルール:',
    '- name: アイテムの名前。日本語、12文字以内。世界観のあるかわいい固有名にする（実物の一般名そのままにしない）。',
    '- description: 妖精がそのアイテムを紹介するひとこと。ペルソナの口調で1〜2文、絵文字なし、プレーンテキスト。',
    '- category: 大まかな種類を1語で（例: 道具 / 植物 / 食べ物 / 鉱石 / 生き物 / 衣類 / その他）。',
    `- rarity: ${RARITIES.join(' / ')} から、見た目の珍しさ・特別感で主観的に1つ選ぶ。`,
    '- 必ず指定の JSON スキーマだけで答える（前置き・コードブロックなし）。',
    '',
    '# ペルソナ定義',
    personaText.trim(),
  ].join('\n')
}
