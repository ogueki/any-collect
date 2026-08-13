# claude.md ― 開発ガイド（このプロジェクトでの約束事）

Claude Code がプロジェクト作業時に参照する**開発規約**。ここには「どう作るか」だけを書く。
**機能仕様＝[spec.md](./spec.md)／決定と経緯・却下案＝[DECISIONS.md](./DECISIONS.md)／進行＝[ROADMAP.md](./ROADMAP.md)／UIの宿題＝[UI-NOTES.md](./UI-NOTES.md)。**

## プロジェクト概要（1段落だけ）
妖精の相棒 **コレット** と、いつもの毎日を「ちょっと冒険」に変える寄り添いブラウザWEBアプリ「**えにこれ**」。**カメラモード**（世界を見せる→反応→アルバム＋図鑑）と **ホームモード**（会話が主役・図鑑からの召喚でアイテム化・たからばこ・メニュー）の2モード。背骨＝**コレットの"欲・好奇心"がユーザーを現実へ連れ出す**。将来 Capacitor でネイティブ化＝**プッシュ通知で"毎日開く理由"を作る**のが主目的。詳細は spec.md §1。

## 技術スタック
- React 19 + TypeScript + Vite + Tailwind CSS + Zustand
- API層：Vercel Serverless Functions（`api/`）／バックエンド：Supabase（STEP6）
- AI：Gemini 2.5 Flash Image（召喚・合成）／ Gemini（反応・会話・名前説明・記憶要約）／ Fish Audio（音声）。会話は将来 Claude に切替可（`ChatProvider` 差し替え）

## 開発コマンド
- `npm run dev` … 開発サーバ
- `npm run build` … 型チェック＋本番ビルド
- `npm run lint` … ESLint（**0 problems が基準**。警告を「既知」として残さない）
- `npm run sprites:optimize` … 画像素材の WebP 化（下記の画像ルール）
- `npm run voice:record` … 固定セリフの事前収録（下記のパートボイスのルール）
- `?debug=1` … 検証用ツールの有効化（`src/lib/debug.ts`・localStorage に永続・`?debug=0` で解除）。実機＝本番 Vercel で使うため URL クエリ方式。

## アーキテクチャ原則（重要）
1. **シークレットをクライアントに出さない。** APIキーを使う処理はすべて `api/`（Vercel Functions）経由。フロントから直接 Gemini/Claude/Fish Audio を叩かない。
2. **抽象化レイヤーを尊重する。** AI・キャラ表示・ストレージは必ずインターフェース越しに使う。具体実装（Gemini等）に直接依存しない。新プロバイダ追加は実装クラスの追加で済む形に。
3. **キャラの統一感はペルソナ定義で担保。** アイテム名/説明/風景コメント/会話の全AI呼び出しは、選択中キャラの `persona.md` を参照する。口調はモデルを跨いでも崩さない。
4. **キャラは差し替え単位。** 新キャラ追加 = `src/characters/<新id>/` を足すだけで動くこと。
5. **失敗をシステムの言葉で見せない。** 生のエラーを画面に出さず、コレットのセリフで受ける（`src/lib/character/failureLines.ts`）。

## ディレクトリ方針
- `api/` … 外部API呼び出し（**鍵を使う処理は必ずここ**）。**新しいエンドポイントを足すときは必ず `_lib/http.ts` の共通ガードを通す**（ボディ/画像のサイズ上限・`sanitizePersonaId`・`sanitizeText`・`fail()` でエラー詳細を隠す）。**相対 import には `.js` 拡張子が必須**（Vercel は nodenext(ESM) でビルドするため。無いと実行時 500）。ファイル一覧は spec.md §8。
- `src/features/<機能>/` … 機能単位（camera / home / collection＝図鑑 / album / kiln＝窯 / treasure＝たからばこ / game / onboarding）。妖精リアクションは表示層なので `src/lib/character/` 側。
- `src/lib/ai/` … AIプロバイダの抽象化（`ImageGenProvider`/`ChatProvider`/`SceneProvider`/`IdentifyProvider`/`TtsProvider`/`MemoryProvider`）＝**差し替え点**。
- `src/lib/character/` … キャラ表示の抽象化（今は2Dスプライト、将来3D/Live2D）。**待ち／失敗の in-character 文面もここ**（`waitLines.ts`／`failureLines.ts`＝**非コーダーが直接編集できる素のテキスト**として保つ）。
- `src/lib/storage/` … Repository パターン。現状＝`ItemRepository`/`PhotoRepository`/`CollectionRepository`（IndexedDB）。記憶・好感度・まほうパワー・会話履歴は軽量値なので localStorage ストア直（Repository 化は STEP6）。**インターフェースを先に切って** IndexedDB↔Supabase を同一抽象の裏に吸収する。
- `src/store/` … Zustand ストア。`src/components/` … モード横断の共有UI。`src/types/` … 共有型。
- `src/characters/<id>/` … キャラ定義一式（`persona.md` ＋ `sprites/<感情>/`＝感情フォルダ式・好感度 level-aware ＋ `backgrounds/<背景ID>/`＝時間帯4枚を `src/lib/character/homeBackground.ts` が切替 ＋ `transitions/`＝場面転換の一枚絵・透過前提 ＋ `voice.json`）。
  - **画像素材のルール**：本番素材は **WebP**（スプライト最大1024px／背景最大1536px）。png/jpg を追加したら **`npm run sprites:optimize` を実行してから commit**（1枚~1MB→~120KB、冪等）。**大きい元 png をそのままコミットしない。**
  - **パートボイスのルール**：`voice/`＝固定セリフの事前収録（`<lineId>.mp3`＋`manifest.json`）。**台本（`src/features/onboarding/script.ts`）の文面・演技指示を直したら `npm run voice:record` を実行してから commit**（冪等・変更が無い回は Fish を叩かない）。回し忘れても動的TTSに落ちるだけで壊れない（判定＝`src/lib/audio/partVoice.ts`）。**`--force` は使わない**＝いま入っている mp3 は聴き比べて選んだテイクで、生成し直すと別の読みになる（DECISIONS 2026-08-14）。`manifest.json` は生成物＝手で書き換えない。

## プライバシー / セキュリティ（遵守）
- **匿名認証**。引き継ぎは **opt-in メール/パスキー**（全員から強制的に PII を集めない）。
- **写真は保存する（アルバム）。既定はローカル端末のみ、クラウド保存は opt-in。**
- **エクスポート・削除を一級機能**にする（"記憶を人質"にしない自制を設計で明示）。
- **モデレーション/安全**：写真の安全チェック／顔の扱い（人物同定・不気味コメント禁）／入力の許容範囲（他人の顔/ブランド/版権・ToS）／クライシス層（自傷・危機→ケア＋相談先）／キャラ崩れフォールバック（実装済）。
- 入力はライブ撮影（アップロード解禁は将来のオプション）。
- Supabase は全テーブル RLS。**データ2クラス**：関係データ＝既定クラウド／生写真＝opt-in クラウド（既定ローカル）。
- 詳細は spec.md §9。

## 環境変数 / シークレット
- サーバ側（Vercel Functions）：`GEMINI_API_KEY` / `FISH_AUDIO_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY`（`ANTHROPIC_API_KEY` は将来 Claude で会話する場合のみ）
- クライアント：`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` のみ（公開前提の値）
- `.env.example` を更新したら必ずコミット。実値はコミットしない。

## コーディング規約
- TypeScript strict。`any` を避け、型を明示。
- 関数コンポーネント＋hooks。状態は Zustand に集約（局所は useState）。**effect 内で local setState しない**（`react-hooks/set-state-in-effect`）＝表示は store からレンダー時に導出する。
- スタイルは Tailwind を基本。デザイントークン（色/フォント）は `tailwind.config.js`＋spec.md §10。
- 既存のユーティリティ/コンポーネントを再利用し、重複実装を避ける。

## ネイティブ化への配慮
- ネイティブ依存（カメラ等）はアダプタ層越しに呼ぶ。Web実装と差し替え可能に保つ。
- まず PWA 対応を維持。Capacitor 化を阻害する構成を入れない。

## ドキュメント運用（実態追従 / docs-follow-code）
- **コード・挙動・方針を変えたら、同じ作業（できれば同じコミット）内で関連ドキュメントを実態に追従させる。** 仕様を先に固めるのではなく、コード/決定が「正」でドキュメントを後から合わせる。
- **書き分け（重要）**：
  - `spec.md` … **いま何がどうなっているか**だけ。**日付・旧仕様・「〜だった」を書かない。**
  - `DECISIONS.md` … **いつ・何を・なぜ決めたか／試して外した案**。追記専用（新しいものが上）。過去のエントリは書き換えず、覆ったら新しいエントリで上書きする。
  - `ROADMAP.md` … STEP の状態だけ（✅完了／🚧一部完了＝「残＝」を明記／⬜未着手）。実装の詳細を書かない。
  - `UI-NOTES.md` … **まだ決着していない** UI の宿題。決着したら DECISIONS へ移す。
- **同じ事実を2か所に書かない。** 片方はリンクにする（重複は必ず片方が腐る）。
- STEP 区切りでコミットする前に、上記4点と実装のズレがないか確認してから commit する。

## 進め方
- **仕様（値・ルール・方針）を変える前に必ず確認を取る。** 実態追従の修正・バグ/セキュリティ修正は確認不要。
- 自律的に進めてよいが、**コミットは各サブステップで自動でせず、区切りのいい所で一旦報告してから**。
- **実機確認は push→Vercel 経由**（`dev --host` は IndexedDB が別オリジン＋カメラ不可で詰む）。
- **ユーザーのフィードバックを勝手に理屈づけてドキュメントに固定しない。**「しっくりこない」は「しっくりこない」のまま記録する。

## やること / やらないこと
- ✅ 鍵処理はサーバ側 ／ 抽象化レイヤー経由 ／ ペルソナ参照（反応・会話・アイテム全部） ／ RLS有効 ／ 写真クラウドは opt-in ／ エクスポート・削除・モデレーションを備える ／ 声は全員に届ける ／ コード変更時にドキュメント追従
- ❌ フロントから直APIキー使用 ／ 写真を無断でクラウド保存（opt-in 必須） ／ 具体AI実装への直接依存 ／ 課金で関係/記憶を人質にする（広告・ゲージ販売も不採用） ／ 実態とズレた仕様書の放置
