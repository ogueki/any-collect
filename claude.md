# claude.md ― 開発ガイド（このプロジェクトでの約束事）

このファイルは Claude Code がプロジェクト作業時に参照する開発規約です。詳細な機能仕様は `spec.md` を参照。

## プロジェクト概要
妖精の相棒と現実のモノを「アイテム」に変えて集めるブラウザWEBアプリ。カメラモード（収集）とホームモード（会話・図鑑・合成）の2モード構成。将来ネイティブアプリ化（Capacitor）を見据える。

## 技術スタック
- React 19 + TypeScript + Vite + Tailwind CSS + Zustand
- API層：Vercel Serverless Functions（`api/`）
- バックエンド：Supabase（Postgres / Storage / 匿名認証）
- AI：Gemini 2.5 Flash Image（画像）/ Gemini（定型テキスト・会話）/ Fish Audio（音声）。会話は将来 Claude に切替可（`ChatProvider` 実装の差し替え）

## 開発コマンド
- `npm run dev` … 開発サーバ
- `npm run build` … 型チェック＋本番ビルド
- `npm run lint` … ESLint

## ディレクトリ方針
- `api/` … 外部API呼び出し（鍵を使う処理は必ずここ）
- `src/features/{camera,home,codex,kiln,fairy}/` … 機能単位
- `src/lib/ai/` … AIプロバイダの抽象化（`ImageGenProvider`/`ChatProvider`/`TtsProvider`）
- `src/lib/character/` … キャラ表示の抽象化（今は2D、将来3D差し替え）
- `src/lib/storage/` … Repositoryパターン（IndexedDB ↔ Supabase）
- `src/characters/<id>/` … キャラ定義一式（`persona.md` / `sprites/` / `voice.json`）

## アーキテクチャ原則（重要）
1. **シークレットをクライアントに出さない。** APIキーを使う処理はすべて `api/`（Vercel Functions）経由。フロントから直接 Gemini/Claude/Fish Audio を叩かない。
2. **抽象化レイヤーを尊重する。** AI・キャラ表示・ストレージは必ずインターフェース越しに使う。具体実装（Gemini等）に直接依存しない。新プロバイダ追加は実装クラスの追加で済む形に。
3. **キャラの統一感はペルソナ定義で担保。** アイテム名/説明/風景コメント/会話の全AI呼び出しは、選択中キャラの `persona.md` を参照する。口調はモデルを跨いでも崩さない。
4. **キャラは差し替え単位。** 新キャラ追加 = `src/characters/<新id>/` を足すだけで動くこと。

## プライバシー / セキュリティ（遵守）
- 匿名認証のみ。メール・氏名等のPIIを収集・保存しない。
- カメラの元写真を永続保存しない（生成アイコンのみ保存、確定後に元画像破棄）。
- 入力はライブ撮影のみ（MVP）。アップロード解禁は将来のオプション。
- Supabase は全テーブル RLS を有効化し、ユーザーは自分の行のみアクセス可。

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
- ✅ 鍵処理はサーバ側 ／ 抽象化レイヤー経由 ／ ペルソナ参照 ／ RLS有効 ／ コード変更時にドキュメント追従
- ❌ フロントから直APIキー使用 ／ 元写真の永続保存 ／ PII収集 ／ 具体AI実装への直接依存 ／ 実態とズレた仕様書の放置
