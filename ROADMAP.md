# ROADMAP ― 実装ステップ

各STEPの終わりに「ブラウザで確認できる動くもの」ができることを原則とする。
詳細仕様は [spec.md](./spec.md)、開発規約は [claude.md](./claude.md) を参照。

| STEP | 内容 | 完了時に確認できること | 状態 |
|---|---|---|---|
| **0. 土台** | Vite+React+TS+Tailwind+Zustand 雛形、モード切替の骨組み、カラー/フォント適用、`.env.example`、抽象IFの空定義 | 2モードが切り替わる空アプリが動く | ✅ 完了 |
| **1. 妖精表示＋ペルソナ** | 2Dキャラ表示（`CharacterRenderer`＋仮イラスト・表情差分）、`characters/default/persona.md` | カメラ右下／ホーム中央に妖精が出る | ✅ 完了 |
| **2. 会話（Gemini）** | `api/chat.ts`＋`ChatProvider`（Geminiで実装、将来Claudeに差し替え可）、ホームの会話UI | 妖精とおしゃべりできる（APIプロキシ＆ペルソナ参照の型を検証） | ✅ 完了 |
| **3. 撮影→アイテム化（Gemini）** ⚠️核 | ライブ撮影、`api/generate-item.ts`、`ImageGenProvider`、リロール、元写真破棄 | 撮影→統一絵柄のアイコン＋名前説明が出る（絵柄統一をここで詰める） | ⬜ |
| **4. 永続化（Supabase）** | 匿名認証、`items`＋RLS、Storage、`ItemRepository`、図鑑UI | 集めたアイテムが保存され図鑑に並ぶ | ⬜ |
| **5. 音声（Fish Audio）** | `api/tts.ts`＋`TtsProvider`、ON/OFF | 妖精が喋る | ⬜ |
| **6. 風景コメント** | `api/describe-scene.ts` | カメラで風景にひとこと | ⬜ |
| **7. 妖精の窯（合成）** | `api/synthesize.ts`、`syntheses`、合成UI | アイテム2つ→新アイテム | ⬜ |
| **8. 仕上げ** | PWA・レート制限・ローディング演出・エラー対応・アニメ | 公開＆将来Capacitor化の準備 | ⬜ |

## メモ
- **STEP0〜3でMVPの背骨**（妖精・会話・収集）が立つ。STEP4で「集めた実感」が出る。
- ⚠️ **STEP3が最大の不確実性**（絵柄の統一感）。必要なら写真1枚のアイコン化スパイクを別途実施。
- 各STEP区切りでコミットする。

## バックログ（将来 STEP 化を検討）
- **イベント / トリガー機能**：特定の行動・状況をきっかけに妖精がイベントを起こす（例：道に迷う→コンパスのアイテムを付与）。
  - 報酬付与は **STEP4（items / ItemRepository）** の上に乗るため、STEP4 以降に独立 STEP として追加するのが自然。
  - 妖精のリアクションは既存の `ChatProvider`＋persona を流用（イベント文脈を渡してキャラ口調で喋らせる）。
  - 要設計：トリガーの入力源（位置情報／滞在・徘徊時間／会話意図 など）を実装時に決定。
  - 実装場所候補：`src/features/events/`（or `src/lib/events/`）。
