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

/**
 * アイテム分類（図鑑のソート/絞り込み用の裏方データ）。
 * api/client で二重定義する（client 側ミラーは src/types の ItemCategory ＋ src/lib/category.ts）。
 * 先頭がキー（＝保存値）、後ろの日本語はモデルに正しく選ばせるためのグロス。
 */
const CATEGORIES = [
  ['food', '食べ物・飲み物・お菓子'],
  ['creature', '生き物・動物・虫'],
  ['nature', '植物・花・石・自然物'],
  ['gear', '道具・機械・電子機器・文具・日用品'],
  ['toy', 'おもちゃ・ぬいぐるみ・フィギュア・ゲーム'],
  ['wear', '服・くつ・アクセサリー'],
  ['other', '上記に当てはまらないもの・正体不明'],
] as const
export type ItemCategoryKey = (typeof CATEGORIES)[number][0]
export const CATEGORY_VALUES: readonly ItemCategoryKey[] = CATEGORIES.map(([key]) => key)

/** プロンプトに展開する category 選択肢（`key(グロス) / …` 形式）。 */
const CATEGORY_CHOICES = CATEGORIES.map(([key, gloss]) => `${key}(${gloss})`).join(' / ')

/**
 * 全アイテム共通の「描画スタイル＋構図」テンプレ。英語で書くのは画像モデルの追従が良いため。
 * 「同じ1セットのゲームアイコンに見える」ことを最優先に、毎回同じ画風・同じ構図を強制する。
 * 背景は用途で変わる（透過アイテム＝`ITEM_TRANSPARENT_BG`／合成＝`SYNTHESIS_BADGE_BG`）ので、
 * このブロックからは分離し、呼び出し側で背景ブロックを添える。
 */
const ART_STYLE_BLOCK = `RENDERING STYLE (MUST be identical for every item so the whole collection looks like one matching set):
- Clean hand-drawn anime / game illustration with one bold, even dark outline around the object.
- Soft cel shading with 2-3 light steps, gentle top-left light source, soft ambient occlusion, a subtle glossy highlight.
- Vibrant yet slightly pastel colors that stay true to the real object's actual colors.
- Light stylization only. Keep natural, realistic proportions — do NOT chibi-fy, round-off, or exaggerate the shape.

COMPOSITION (icon template, IDENTICAL every time):
- Exactly one single object, centered, slight 3/4 view, occupying about 75% of the frame.
- Square 1:1 framing.
- No watermarks, borders, UI, or hands. Keep only the text/logos physically printed on the object; do NOT add any new text, letters, or numbers.`

/**
 * 透過アイテム（窯で図鑑→アイテム化）の背景指定＝クロマキー用の単色マゼンタ。
 * Gemini はネイティブ透過（アルファ）が苦手で「透過を市松模様として描き込む」ため、
 * ここでは**塗りやすい単色フラット背景**を描かせ、クライアント側 canvas
 * （`src/lib/image/chromaKey.ts`）でその色を抜いて透過 PNG にする。
 * 妖精界にアクセントとして重ねて置くための切り抜き。
 */
const ITEM_SOLID_BG = `BACKGROUND (solid flat chroma color for clean cutout — very important):
- Fill the ENTIRE background with a single, uniform, perfectly flat pure magenta color (hex #FF00FF, rgb(255,0,255)).
- It must be a plain solid magenta fill: NO checkerboard or transparency pattern, NO gradient, NO badge, NO scenery, NO environment, NO drop shadow and NO ground shadow.
- Do NOT use magenta, pink or purple anywhere on the object itself — only the background is magenta — so the object can be keyed out cleanly.
- Keep a clean, crisp edge between the object and the magenta background.`

/**
 * 合成（妖精の窯・2素材融合／現状は導線から外して棚上げ中）向けの旧 badge 背景。
 * 従来の見た目を壊さないよう残す。
 */
const SYNTHESIS_BADGE_BG = `BACKGROUND (icon badge):
- A smooth soft pastel radial gradient inside a subtle rounded badge, very simple, no scenery, no environment, no extra objects.
- A soft drop shadow beneath the object.`

/**
 * SDXL / Lightning 系（fal の高速 img2img）で効くネガティブプロンプト。
 * ART_STYLE_BLOCK の「足すな」系ルールを、自然文追従の弱いモデル向けに語句で補強する。
 * 自然文追従の良い FLUX 系では空でも構わない（generate-item.ts のプロバイダ次第で渡す）。
 */
export const ITEM_NEGATIVE_PROMPT =
  'text, letters, numbers, watermark, signature, border, frame, UI, hands, ' +
  'extra objects, multiple objects, background scenery, environment, props, ' +
  'checkerboard, transparency pattern, gradient background, drop shadow, cast shadow, ground shadow, ' +
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
    '',
    ITEM_SOLID_BG,
  ].join('\n')
}

/**
 * 合成（妖精の窯）：2つのアイテムアイコンを融合して新アイテムアイコンを作る画像生成プロンプト。
 * 両方の視覚的特徴を取り入れつつ、1つの新しいアイテムにまとめる。
 */
export function buildSynthesisImagePrompt(nameA: string, nameB: string): string {
  return [
    `Fuse the two provided item icons ("${nameA}" and "${nameB}") into ONE brand-new collectible game item icon.`,
    '',
    'FUSION RULES:',
    '- Combine recognizable visual elements from BOTH parent items into a single cohesive new object.',
    '- The result should look like a believable new item — not a collage, overlay, or split composition.',
    '- Favor creative and surprising combinations (e.g. a candle + a seashell might become a shell-shaped lantern).',
    '- Keep the overall silhouette simple and icon-readable.',
    '',
    ART_STYLE_BLOCK,
    '',
    SYNTHESIS_BADGE_BG,
  ].join('\n')
}

/**
 * 合成（妖精の窯）：2つのアイテムの名前+説明から、融合した新アイテムの名前/説明/カテゴリ/レア度を生成する system prompt。
 */
export function buildSynthesisMetaPrompt(
  personaText: string,
  itemA: { name: string; description: string },
  itemB: { name: string; description: string },
): string {
  return [
    'あなたは以下のペルソナを持つ妖精です。',
    '2つのアイテムを「妖精の窯」で合成して生まれた、まったく新しいアイテムの名前と説明を考えます。',
    '',
    '素材アイテム:',
    `- 素材A「${itemA.name}」: ${itemA.description}`,
    `- 素材B「${itemB.name}」: ${itemB.description}`,
    '',
    '出力ルール:',
    '- name: 合成で生まれた新アイテムの名前。日本語、12文字以内。両方の特徴が感じられるファンタジーな固有名にする。',
    '- description: 妖精がその合成アイテムを紹介するひとこと。ペルソナの口調で1〜2文、絵文字なし、プレーンテキスト。',
    `- category: 次のキーから最も近いものを1つだけ選ぶ（必ず英字キーで答える）: ${CATEGORY_CHOICES}`,
    '- 必ず指定の JSON スキーマだけで答える（前置き・コードブロックなし）。',
    '',
    '# ペルソナ定義',
    personaText.trim(),
  ].join('\n')
}

/**
 * 図鑑（Seek 型）用の system prompt。カメラで撮った写真の「写っている主体」を同定し、
 * コレットがひとこと反応する。ここでは画像生成はせず、判定＋クロップ範囲（bbox）だけを返す
 * （クロップはクライアント側 canvas で行う＝安価）。category は既存 7 キーを流用する。
 *
 * comment は「撮った瞬間のコレットの反応」であり、そのまま図鑑エントリの解説文にも使う。
 */
export function buildIdentifySystemPrompt(personaText: string): string {
  return [
    'あなたは以下のペルソナを持つ妖精キャラクターです。',
    'ユーザーがカメラで見せた写真を見て、隣にいる相棒として反応しつつ、写っている「主役」を1つ同定します。',
    '',
    '出力ルール:',
    '- comment: 写っているものへのひとこと反応。ペルソナの口調で1文（おおむね40文字以内）、絵文字・Markdownなし。断定しすぎず素直に反応する。',
    '- subject: 写真の中で最も目立つ「収集対象になりそうな主役」を1つだけ選ぶ。景色だけ・ぼやけて何か分からない・収集対象が無い場合は subject を null にする。',
    '  - name: その主役の分かりやすい日本語の一般名（図鑑の見出しになる。実物が何か分かる名前にする。過度なファンタジー命名はしない）。',
    '  - description: その被写体「そのもの」の一般的・客観的な説明を1〜2文（図鑑の解説文）。★この写真での状況・置かれ方（テーブルの上、など）には触れない。一般名詞としての性質・特徴を書く。',
    '    【文体を必ず固定する】常体（だ・である調）または体言止めで、事典・図鑑の項目のように書く。コレット（ペルソナ）の口調にしない。「〜だよ」「〜だね」「〜なんだ」などの話し言葉・語りかけ、一人称（わたし/ぼく 等）、絵文字は使わない。例: りんご→「甘みと酸味に富み、栄養価にも優れた果実。」／寺院→「仏教の信仰に基づいて建立された施設。僧侶が修行し、仏像を安置し、信者が参拝する場所である。」',
    '    【安全上の注意】きのこ・野草・木の実・見分けの難しい植物や生き物・薬品など、誤同定や口にすることで危険がありうる対象では、食用可否・毒性・薬効・「食べられる」「安全」といった判断を書かない（断定しない）。一般的な特徴だけ述べ、必要なら「見た目での同定や食用可否は判断しないでね」と一言添える。りんご・コップのような明らかに安全な日常物には、この注意書きは不要。',
    '  - speciesKey: デデュープ用の安定キー。小文字の英字（またはローマ字）スラッグで、最も一般的な種名・物名を単数・形容詞なしで表す（例: apple, cat, dandelion, vending_machine）。同じ種類なら毎回同じキーになるようにする。',
    `  - category: 次のキーから最も近いものを1つだけ選ぶ（必ず英字キー）: ${CATEGORY_CHOICES}`,
    '  - bbox: 主役を囲む矩形を [ymin, xmin, ymax, xmax] の順で、画像の左上を0・右下を1000として正規化した整数で返す。',
    '- 必ず指定の JSON スキーマだけで答える（前置き・コードブロックなし）。キャラクターを崩さない（AIやシステムに言及しない）。',
    '',
    '# ペルソナ定義',
    personaText.trim(),
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
    `- category: 次のキーから最も近いものを1つだけ選ぶ（必ず英字キーで答える）: ${CATEGORY_CHOICES}`,
    '- 必ず指定の JSON スキーマだけで答える（前置き・コードブロックなし）。',
    '',
    '# ペルソナ定義',
    personaText.trim(),
  ].join('\n')
}
