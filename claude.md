# claude.md ― 開発ガイド（このプロジェクトでの約束事）

このファイルは Claude Code がプロジェクト作業時に参照する開発規約です。詳細な機能仕様は `spec.md` を参照。

## プロジェクト概要
妖精の相棒 **コレット** と、いつもの毎日を「ちょっと冒険」に変える寄り添いブラウザWEBアプリ。**カメラモード**（世界を見せる＝撮影→声つき反応→写真をアルバムに保存）と **ホームモード**（会話が主役・図鑑からの召喚魔法でアイテム化・妖精界・メニュー＝窯で合成/アルバム/ゲーム）の2モード構成。
- **背骨**：コレットの"欲・好奇心"がユーザーを現実へ連れ出す（「行きたいなら行ってみるか」）。
- **二重構造**：カメラ→写真→**アルバム（あなたの世界）**／図鑑エントリ→召喚魔法→透過アイテム→**妖精界（コレットの世界）**／召喚＝橋。妖精の窯＝アイテム2つの合成（メニュー内）。
- **v2 転換（2026-07-02）**：旧「撮影→即スキャン画像生成で収集」から、**会話＋アルバム＋妖精界コア**へ移行（コスト・リテンション両面）。詳細は `spec.md`、進行は `ROADMAP.md`。
- 将来ネイティブアプリ化（Capacitor）＝**プッシュ通知で"毎日開く理由"を作る**のが主目的。

## 技術スタック
- React 19 + TypeScript + Vite + Tailwind CSS + Zustand
- API層：Vercel Serverless Functions（`api/`）
- バックエンド：Supabase（Postgres / Storage / 匿名認証）
- AI：Gemini 2.5 Flash Image（**召喚＝図鑑エントリのクロップ→透過アイテム**・まほうパワー配給／**窯＝2アイテム合成**）/ Gemini（反応・会話・名前説明・記憶要約）/ **Fish Audio（音声＝稼働。カメラ反応の自動読み上げ＋会話返信の🔊タップ＝動的TTS。ホームの事前収録パートボイスは STEP3b で後続）**。会話は将来 Claude に切替可（`ChatProvider` 差し替え）

## 開発コマンド
- `npm run dev` … 開発サーバ
- `npm run build` … 型チェック＋本番ビルド
- `npm run lint` … ESLint

## ディレクトリ方針
> 「現状」＝実在するもの、「将来/後続」＝対応STEPで追加予定（最終形の案は `spec.md §8`）。
- `api/` … 外部API呼び出し（鍵を使う処理は必ずここ）。`describe-scene.ts`（景色ひとこと・図鑑に残さない・現在導線なしの残置）/ `identify.ts`（図鑑判定＝主役同定＋bbox・Seek型）/ `chat.ts`（会話・接地注入）/ `generate-item.ts`（召喚＝図鑑エントリ→透過アイテム）/ `synthesize.ts`（窯＝2アイテム合成）/ `tts.ts`（Fish・稼働＝カメラ反応の動的読み上げ／声設定は `characters/<id>/voice.json`）/ `memory.ts`（会話→記憶ファクト抽出。保存はクライアント側）＋ `_lib/`（persona/gemini/gemini-image/fal-image/item-prompt/voice・ルート対象外）。
- `src/features/<機能>/` … 機能単位。`camera/`（見せる・判定・図鑑収集＋アルバム保存）/ `home/` / `collection/`（図鑑＝実物のクロップ収集・Seek型）/ `album/`（思い出写真・旧 codex を置換）/ `kiln/`（妖精の窯＝2アイテム合成。図鑑→透過アイテムの召喚は `collection/` 側に移設）/ `realm/`（妖精界）/ `onboarding/`。妖精リアクションは表示層なので `src/lib/character/` 側。クロップは `src/lib/image/crop.ts`。
- `src/lib/ai/` … AIプロバイダの抽象化（`ImageGenProvider`/`ChatProvider`/`SceneProvider`/`IdentifyProvider`/`TtsProvider`/`MemoryProvider`）
- `src/lib/character/` … キャラ表示の抽象化（今は2Dスプライト、将来3D/Live2D差し替え）
- `src/lib/storage/` … Repositoryパターン。現状＝`ItemRepository`/`PhotoRepository`/`CollectionRepository`（IndexedDB 実装済）。記憶・好感度・まほうパワーは軽量値なので現状 localStorage ストア直（`MemoryRepository`/`AffinityRepository` は Supabase 移行＝STEP6 で切る）。**インターフェースを先に切って** IndexedDB（先行）↔ Supabase（後続）を同一抽象の裏に吸収。
- `src/store/` … Zustand ストア（`appStore` / `chatStore` / `albumStore` / `collectionStore`（図鑑） / `codexStore`（生成アイテム） / `gaugeStore` / `affinityStore` / `memoryStore` / `gameStore`）。`src/components/` … モード横断の共有UI（`WorkingScreen`/`MenuSheet`/`icons` 等）。`src/types/` … 共有型。
- `src/characters/<id>/` … キャラ定義一式。デフォルト＝`default`（コレット）。`persona.md`（**好奇心旺盛・冒険好き・欲・決め台詞多め**）＋ `sprites/<感情>/*.webp`（感情フォルダ式・好感度 level-aware）＋ `backgrounds/<背景ID>/*.webp`（ホーム背景＝時間帯4枚 morning/day/evening/night・`src/lib/character/homeBackground.ts` が切替）＋ `voice.json`（音声設定・稼働）。
  - **画像素材のルール**：本番素材は **WebP**（スプライト＝最大1024px／背景＝最大1536px）。`sprites/` や `backgrounds/` に png/jpg を追加したら **`npm run sprites:optimize` を実行してから commit**（`scripts/optimize-sprites.mjs` が WebP 化＝1枚~1MB→~120KB、冪等）。大きい元 png をそのままコミットしない。

## アーキテクチャ原則（重要）
1. **シークレットをクライアントに出さない。** APIキーを使う処理はすべて `api/`（Vercel Functions）経由。フロントから直接 Gemini/Claude/Fish Audio を叩かない。
2. **抽象化レイヤーを尊重する。** AI・キャラ表示・ストレージは必ずインターフェース越しに使う。具体実装（Gemini等）に直接依存しない。新プロバイダ追加は実装クラスの追加で済む形に。
3. **キャラの統一感はペルソナ定義で担保。** アイテム名/説明/風景コメント/会話の全AI呼び出しは、選択中キャラの `persona.md` を参照する。口調はモデルを跨いでも崩さない。
4. **キャラは差し替え単位。** 新キャラ追加 = `src/characters/<新id>/` を足すだけで動くこと。

## プライバシー / セキュリティ（遵守）
> **v2 で方針転換**：アルバム機能のため「元写真を永続保存しない」を反転。製品化＝データ責任を正式にスコープに入れる。詳細は `spec.md §9`。
- **匿名認証**。引き継ぎは **opt-in メール/パスキー**（本人が選んだ時だけ＝全員から強制的に PII を集めない精神は維持）。
- **写真は保存する（アルバム）。既定はローカル端末のみ、クラウド保存は opt-in。** ← 旧「元写真を永続保存しない」を廃止。
- **エクスポート・削除を一級機能**にする（"記憶を人質"にしない自制を設計で明示）。
- **モデレーション/安全**：写真の安全チェック（NSFW/違法）／顔の扱い（人物同定・不気味コメント禁）／入力の許容範囲（他人の顔/ブランド/版権・ToS 確認）／クライシス層（自傷・危機→ケア+相談先）／キャラ崩れフォールバック（AI 拒否/破綻を捕捉→in-character）。
- 入力はライブ撮影（アップロード解禁は将来のオプション）。
- Supabase は全テーブル RLS。**データ2クラス**：関係データ（好感度・記憶要約・アイテムメタ）＝既定クラウド／生写真＝opt-inクラウド（既定ローカル）。

## 環境変数 / シークレット
- サーバ側（Vercel Functions）：`GEMINI_API_KEY` / `FISH_AUDIO_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY`（`ANTHROPIC_API_KEY` は将来 Claude で会話する場合のみ）
- クライアント：`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` のみ（公開前提の値）
- `.env.example` を更新したら必ずコミット。実値はコミットしない。

## コーディング規約
- TypeScript strict。`any` を避け、型を明示。
- 関数コンポーネント＋hooks。状態は Zustand に集約（局所はuseState）。
- スタイルは Tailwind を基本。デザイントークン（色/フォント）は spec.md のパレットに従う。
- 既存のユーティリティ/コンポーネントを再利用し、重複実装を避ける。

## ネイティブ化への配慮
- ネイティブ依存（カメラ等）はアダプタ層越しに呼ぶ。Web実装と差し替え可能に保つ。
- まず PWA 対応を維持。Capacitor 化を阻害する構成を入れない。

## ドキュメント運用（実態追従 / docs-follow-code）
- **コード・挙動・方針を変えたら、同じ作業（できれば同じコミット）内で関連ドキュメントを実態に追従させる。** 仕様を先に固めるのではなく、コード/決定が「正」でドキュメントを後から合わせる。
  - `spec.md` … 機能仕様・データモデル・将来方針。挙動や対象範囲、ストレージ/AI構成が変わったら更新。
  - `ROADMAP.md` … STEP の状態（✅/⬜）と番号。STEP の実装・順序変更のたびに更新。
  - `UI-NOTES.md` … レイアウト/UX の気づき。
- STEP 区切りでコミットする前に、上記3点と実装のズレがないか確認してから commit する。

## やること / やらないこと
- ✅ 鍵処理はサーバ側 ／ 抽象化レイヤー経由 ／ ペルソナ参照（反応・会話・アイテム全部） ／ RLS有効 ／ 写真クラウドは opt-in ／ エクスポート・削除・モデレーションを備える ／ 声は全員に届ける ／ コード変更時にドキュメント追従
- ❌ フロントから直APIキー使用 ／ 写真を無断でクラウド保存（opt-in 必須） ／ 具体AI実装への直接依存 ／ 課金で関係/記憶を人質にする（広告・ゲージ販売も不採用） ／ 実態とズレた仕様書の放置
