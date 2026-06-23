# ROADMAP ― 実装ステップ

各STEPの終わりに「ブラウザで確認できる動くもの」ができることを原則とする。
詳細仕様は [spec.md](./spec.md)、開発規約は [claude.md](./claude.md) を参照。

| STEP | 内容 | 完了時に確認できること | 状態 |
|---|---|---|---|
| **0. 土台** | Vite+React+TS+Tailwind+Zustand 雛形、モード切替の骨組み、カラー/フォント適用、`.env.example`、抽象IFの空定義 | 2モードが切り替わる空アプリが動く | ✅ 完了 |
| **1. 妖精表示＋ペルソナ** | 2Dキャラ表示（`CharacterRenderer`＋仮イラスト・表情差分）、`characters/default/persona.md` | カメラ右下／ホーム中央に妖精が出る | ✅ 完了 |
| **2. 会話（Gemini）** | `api/chat.ts`＋`ChatProvider`（Geminiで実装、将来Claudeに差し替え可）、ホームの会話UI | 妖精とおしゃべりできる（APIプロキシ＆ペルソナ参照の型を検証） | ✅ 完了 |
| **3. 撮影→アイテム化（Gemini）** ⚠️核 | ライブ撮影、`api/generate-item.ts`、`ImageGenProvider`、リロール、元写真破棄 | 撮影→統一絵柄のアイコン＋名前説明が出る（絵柄統一をここで詰める） | ✅ 完了（絵柄統一を実機チューニング合格） |
| **4. 永続化（IndexedDB先行）** | `ItemRepository`＋`indexedDbItemRepository`、確定保存、図鑑UI（`CodexView`） | 集めたアイテムが保存され図鑑に並ぶ | ✅ 完了（STEP4a）。Supabase 移行は後続（下記）に分離 |
| **5. 妖精の感情リアクション** | 感情フォルダ式スプライト（`sprites/<emotion>/`）＋CSSアニメ、生成/確定で発火、好感度 level-aware 表示、**会話の返事ごとに emotion で表情切替（AIが返事と一緒に感情を選ぶ／responseSchema）**、感情12種（shy/confused/exasperated/angry/salute/searching を追加。鑑定中=searching） | 撮影・確定・**会話**で妖精が表情/ポーズで反応する | ✅ 完了（実機目視チューニング・ポーズ絵量産は残） |
| **6. 音声（TTS）** | `api/tts.ts`＋`TtsProvider`、ON/OFF | 妖精が喋る | ⏸ 保留（TTSサービス選定中。`TtsProvider` IF は用意済み・後続に依存なし） |
| **7. 風景コメント** | `api/describe-scene.ts`＋`SceneProvider`。**カメラ右下の妖精タップ**で発動→ひとこと吹き出し＋表情（図鑑には残さない・元写真破棄） | カメラで風景にひとこと | ✅ 完了（実機目視はデプロイ後） |
| **8. 妖精の窯（合成）** | `api/synthesize.ts`、`syntheses`、合成UI | アイテム2つ→新アイテム | ⬜ |
| **9. Supabase 永続化への移行** | 匿名認証、`items`＋RLS、Storage、同一 `ItemRepository` 裏に Supabase 実装を追加 | 端末を跨いでアイテムが保存される（抽象は不変、IndexedDB↔Supabase） | ⬜ |
| **10. 仕上げ** | PWA・レート制限・ローディング演出・エラー対応・アニメ | 公開＆将来Capacitor化の準備 | ⬜ |

## メモ
- **STEP0〜3でMVPの背骨**（妖精・会話・収集）が立つ。STEP4（IndexedDB図鑑）で「集めた実感」、STEP5（リアクション）で「相棒が反応する手応え」が出る。
- ⚠️ **STEP3が最大の不確実性**（絵柄の統一感）→ 実機チューニングで合格済み。
- 永続化は**IndexedDB 先行**で図鑑を即動かし、Supabase は後で同じ `ItemRepository` 裏に追加する方針（最終形＝spec §8 の IndexedDB↔Supabase 抽象は不変）。
- **スキャン高速化の検証（実験中）**：撮影アイテム化の ~9–11s は Gemini 2.5 Flash Image の生成時間が律速。サーバ env `IMAGE_PROVIDER=fal` で高速 img2img に差し替えて速度・コスト・忠実度を A/B 評価できる（既定は Gemini ＝完全可逆、新 STEP 化はせず評価結果次第）。詳細は spec §5。
- 各STEP区切りでコミットする。

## バックログ（将来 STEP 化を検討）
- **リテンション機構（毎日開く理由）**：製品の軸＝[spec.md](./spec.md) 「製品の方向性・リテンション設計（将来検討）」章を参照。STEP4（items / ItemRepository）の上に乗る。
  - **今日のおだい**：時間/天気/位置のコンテキスト連動プロアクティブ（例「雨だね、今日は家の中で何か」）。
  - **絆レベル**：収集で上昇 → 表情/新妖精/能力 解放。**表示側の level-aware は STEP5 で実装済み、「源（収集数等）」の配線が未**＝呼び出し側に `level` を1箇所差すだけ。
  - **図鑑＝絵日記/思い出アルバム**：妖精が図鑑を知って言及（例「最近 鉱石ばっかりだね」「1ヶ月前の今日これ見つけたね」）。墓場にしない。
  - **プロアクティブ通知は Web で弱い** → Capacitor ネイティブ化の主目的＝「通知で開く理由を作る」。
- **イベント / トリガー機能**：特定の行動・状況をきっかけに妖精がイベントを起こす（例：道に迷う→コンパスのアイテムを付与）。
  - 報酬付与は **STEP4（items / ItemRepository）** の上に乗るため、STEP4 以降に独立 STEP として追加するのが自然。
  - 妖精のリアクションは既存の `ChatProvider`＋persona を流用（イベント文脈を渡してキャラ口調で喋らせる）。
  - 要設計：トリガーの入力源（位置情報／滞在・徘徊時間／会話意図 など）を実装時に決定。
  - 実装場所候補：`src/features/events/`（or `src/lib/events/`）。
