# ふぇありこれ（仮）／ 妖精と集める世界アイテム図鑑 ― 仕様書

## 1. コンセプト
妖精の相棒と一緒に、現実世界のモノを「ゲームのアイテム」に変えて集めるブラウザWEBアプリ。
- **カメラモード**：外で見つけたモノをカメラで撮ると、AIが統一された絵柄のアイテムアイコン＋名前＋説明に変換し、図鑑に登録する。妖精が隣でリアクション。
- **ホームモード**：大きく表示される妖精とまったりおしゃべりし、図鑑を眺め、集めたアイテム同士を「妖精の窯」で合成して新しいアイテムを生み出す。

体験の核：**「集める楽しさ」×「相棒の妖精との情緒的なつながり」**。

## 2. ターゲット / プラットフォーム
- ブラウザWEBアプリ（スマホ・PC両対応、モバイル優先のレイアウト）。
- 将来的に **Capacitor** でネイティブアプリ化（iOS/Android）。そのため設計段階からネイティブ移行を阻害しない作りにする。

## 3. 全体構成（2モード）
| モード | 役割 | 妖精の表示 |
|---|---|---|
| カメラモード | アイテム収集（撮影→アイコン化→図鑑登録）＋風景コメント | 画面右下に小さく、撮影に反応 |
| ホームモード | 会話・図鑑鑑賞・合成（妖精の窯） | 画面中央に大きく |

モード切替はグローバルなナビゲーションで行う。

## 4. 機能仕様

### 4.1 カメラモード
1. **アイテム化フロー**
   - ライブカメラで撮影（※MVPではアップロード/ギャラリーは不可）。
   - 撮影画像をAPIプロキシ経由で **Gemini 2.5 Flash Image** に渡し、**統一された絵柄のアイテムアイコン**を生成。
   - 同時に **Gemini** で **アイテム名・説明文・カテゴリ・レア度**を生成（カテゴリ/レア度は `responseSchema` の enum で固定キーに強制）。
   - 結果を確認し、気に入らなければ**作り直し（リロール）**可能（元写真はこの間だけ保持）。
   - 確定すると図鑑に登録。**元写真は破棄**（保存しない）。
   - 絵柄統一は、全生成で共通の**アートスタイル指定（プロンプト＋アイコン枠/構図のテンプレ）**で担保する。
2. **風景コメント（サブ機能）**
   - **画面右下の妖精をタップ**すると、いまの景色を1フレーム撮って **Gemini** で妖精のひとことコメント＋感情を生成し、吹き出しで表示（数秒で消える）。図鑑には登録しない・元写真は破棄＝その場の演出。新ボタンは足さず「相棒に話しかける」操作にする。
   - 経路：`SceneProvider`（`describeScene`）→ `/api/describe-scene` → `generateSceneComment`（persona参照・`responseSchema` で `comment`＋`emotion`）。感情は §4.1.3 の `useFairyReaction` でモーション/表情に反映。
3. **妖精のリアクション**
   - 画面右下に妖精（2Dイラスト）。撮影・生成成功・レア度・新カテゴリなどに応じて表情/ポーズ差分でリアクション。鑑定中（生成待ち）は **searching**（調べる探偵ポーズ）を表示。
   - 実装：**感情ごとのフォルダ式スプライト**（`sprites/<emotion>/*.webp`、何枚でも置くとランダム候補。元 png を置いたら `npm run sprites:optimize` で WebP・最大1024px へ最適化）＋ **CSSアニメ**（常時の浮遊＋感情別の一発アニメ）の2層。一定時間でベース表情へ戻る。
   - 感情語彙の単一ソースは `src/lib/character/CharacterRenderer.ts` の `FAIRY_EXPRESSIONS`（neutral/happy/surprised/thinking/sad/excited/shy/confused/exasperated/angry/salute/searching）。新感情の追加はここへ1行＋同名フォルダで完結。
   - 一時リアクションの**発火**は共有フック `useFairyReaction()`（`fire(emotion)`→数秒でベース表情へ復帰＋`animateKey` で一発アニメ）に集約。カメラ／ホーム会話／将来の風景コメント・妖精の窯が同じフックを使う。「どの感情にするか（選定）」は文脈依存（アイテム=`reaction.ts` の決定ルール／会話=AI が responseSchema で選ぶ）。**場面固有のモーション**（例：鑑定中=searching）は「感情キー追加＋`sprites/<キー>/`＋その場面で描画」の3手で足せる。
   - **好感度レベルでの素材切替（level-aware）に対応**（`sprites/<emotion>/lv1,lv2/`、不足時は下位/共通/neutral へフォールバック）。**好感度の"源"は将来配線**（絆レベルの意味づけは §14 参照）。
4. **音声**
   - 妖精のセリフを **Fish Audio API**（TTS）で読み上げ（ON/OFF切替可）。

### 4.2 ホームモード
1. **会話（メイン）**
   - 中央に大きな妖精。テキスト入力で会話（初期は **Gemini**、将来 **Claude** に切替可）。キャラ定義ファイルに沿った口調・性格を維持。
   - **会話の返事ごとに表情が切り替わる**：AI が返事と一緒に感情を1つ選び（`responseSchema` で `text`＋`emotion` を出力）、その emotion を立ち絵の表情にする。返信のたびに §4.1.3 と同じ一発アニメが走る。エラー=sad は会話状態由来。送信中は表情を変えない（考え中の合図は ChatPanel のテキストで表示）。未取得/不正な emotion は neutral へフォールバック。会話で AI が選べる感情（`CHAT_EMOTIONS`）＝neutral/happy/surprised/sad/excited/shy/confused/exasperated/angry/salute/thinking（`searching` はカメラ鑑定中専用なので会話では除外）。**どの返事でどの感情を選ぶかの基準は、各キャラの `persona.md` の「感情の出し方」セクション**（非コーダーでも編集可、システムプロンプトに自動で乗る）。
   - 将来 Fish Audio 音声。会話履歴は保存（任意でローカル/クラウド）。
2. **図鑑**
   - 収集アイテムを一覧・詳細表示。名前・説明・取得日時などを閲覧。**並び替え（新しい順/カテゴリ順）＋カテゴリ絞り込みは実装済み**（検索は後続）。カテゴリはグリッドのカードには出さず、整理（ソート/フィルタ）と詳細表示にだけ使う裏方データ。
3. **妖精の窯（合成）**
   - **ホームモードのサブビュー**として実装（「おしゃべり」↔「妖精の窯」のタブ切替）。妖精の立ち絵は共通表示。
   - アイテムを**2つ選んで合成**し、新しいアイテムを生み出す。**素材は消費しない**（図鑑に残る）。
   - 合成は **Gemini 2.5 Flash Image**（2素材のアイコンを入力し、融合した新アイコンを生成）＋ **Gemini**（両素材の名前・説明から新しい名前・説明・カテゴリ・レア度を生成）。画風は撮影アイテム化と同一の `ART_STYLE_BLOCK`（`item-prompt.ts`）を共有。
   - 合成元・結果の系譜を `syntheses` に記録（`ItemRepository.recordSynthesis`）。
   - 待ち時間中は `GeneratingOverlay`（`context='synthesizing'`）で窯の演出。生成成功/図鑑確定でカメラと同じ妖精リアクション（`useFairyReaction`＋`reaction.ts`）。
   - 「もう一回合成」（同じ素材で再生成）と「素材を変える」（選択に戻る）を選べる。

### 4.3 妖精キャラクター
- **2Dイラスト**（表情/ポーズ差分）。表示は抽象化レイヤー越し（将来 Live2D/3D-VRM へ差し替え可能）。
- **差し替え可能**：1キャラ＝「**キャラクター定義ファイル一式**」＝ ①ペルソナ定義（口調/性格/世界観/口癖）②イラスト差分セット ③ Fish Audio 音声設定。
- **キャラ統一の原則**：アイテム名/説明/風景コメント/会話の**すべてのAI呼び出しがペルソナ定義を参照**する。モデルを跨いでもブレない。

## 5. AI構成
| 用途 | サービス | 概算コスト | 備考 |
|---|---|---|---|
| アイテムアイコン化・合成 | Gemini 2.5 Flash Image（既定）／fal 高速モデル（検証中） | 約 $0.04/枚（fal は ~1/10〜同等） | 画像編集・画風/キャラ一貫性に強い。スキャンの体感 ~9–11s はこの画像生成が律速 |
| アイテム名・説明・風景コメント | Gemini（テキスト） | 低コスト | 画像と同一API |
| 妖精の会話 | **Gemini（初期）→ Claude（将来切替可）** | 低〜中 | `ChatProvider` 抽象で差し替え。口調は persona.md で統一するためモデル非依存 |
| 音声合成 | Fish Audio | 従量 | キャラごとに音声設定 |

※価格は変動するため実装時に最新を確認。
※**画像生成の高速化検証**：撮影アイテム化の画像生成はサーバ env `IMAGE_PROVIDER`（`gemini` 既定／`fal`）で差し替え可能（メタ生成は常に Gemini）。fal は `FAL_KEY` ＋ `FAL_IMAGE_MODEL`/`FAL_IMG2IMG_STRENGTH` でモデル・忠実度を調整。未設定なら現行 Gemini のまま＝完全可逆。本採用は速度・コスト・忠実度の目視判断後。

## 6. データモデル（Supabase / Postgres）
> **現状（実装ステータス）：永続化は IndexedDB 先行**で図鑑が稼働中（`ItemRepository` の IndexedDB 実装）。下記 Supabase スキーマは**最終形**であり、同じ `ItemRepository` 抽象の裏に後続 STEP で追加する（抽象は不変）。ROADMAP STEP9 参照。

- 認証：**匿名認証**（`auth.users` の匿名ID）。メール等のPIIは収集しない。
- 全テーブルに **Row Level Security**：各ユーザーは自分の行のみアクセス可。
- テーブル（案）
  - `profiles`：匿名ユーザー設定（選択中キャラ、音声ON/OFF 等）
  - `items`：`id, user_id, name, description, category, rarity, icon_url, created_at`（`category` は安定キー `food/creature/nature/gear/toy/wear/other` の固定集合。表示カタカナは `src/lib/category.ts` の `CATEGORY_LABEL` で変換。旧/未知値は `other` に正規化）
  - `syntheses`：`id, user_id, result_item_id, parent_a_id, parent_b_id, created_at`
  - `conversations`：`id, user_id, role, content, created_at`（任意。ローカル保持でも可）
- Storage：生成アイコン用バケット `item-icons`。**元写真は保存しない**。

## 7. 技術スタック
- フロント：React 19 + TypeScript + Vite + Tailwind CSS + Zustand
- API層：Vercel Serverless Functions（**APIキーはここに集約しクライアントに出さない**）
- バックエンド：Supabase（Postgres / Storage / Anonymous Auth）
- AI：Gemini（画像・定型テキスト・**会話**）／ Fish Audio（音声）。会話は将来 Claude に切替可（`ChatProvider` 実装の差し替え）

## 8. アーキテクチャ / 拡張性
拡張・ネイティブ化を見据え、以下を**インターフェースで抽象化**する：
- **AIプロバイダ**：`ImageGenProvider` / `ChatProvider` / `SceneProvider`（風景コメント）/ `TtsProvider` を定義し、実装（Gemini/Claude/FishAudio）を差し替え可能に。
- **キャラレンダラ**：`CharacterRenderer`（今は2Dスプライト実装、将来3D/Live2D実装を追加）。
- **ストレージ**：Repository パターン（`ItemRepository` 等）で IndexedDB ↔ Supabase を抽象化（オフライン対応・ネイティブ移行を容易に）。**現状は IndexedDB 実装のみ稼働**、Supabase 実装は後続で同じ抽象の裏に追加（ROADMAP STEP9）。
- **キャラクター定義**：`characters/<id>/` 配下にペルソナ・差分・音声をまとめ、ディレクトリ単位で差し替え。

### ディレクトリ構成（案）
```
any-collect/
  api/                       # Vercel Functions（鍵はここ）
    generate-item.ts         # Gemini: 写真→アイコン+名前+説明
    describe-scene.ts        # Gemini: 風景コメント
    synthesize.ts            # Gemini: アイテム合成
    chat.ts                  # Gemini: 妖精会話（将来 Claude へ切替可）
    tts.ts                   # Fish Audio: 音声
    _lib/                    # Function 共通のサーバ内部ユーティリティ（persona/gemini 等・ルート対象外）
  src/
    features/{camera,home,codex,kiln}/   # kiln（合成）は STEP8。妖精リアクションは表示層なので features ではなく lib/character/ 側
    lib/
      ai/{imageProvider,chatProvider,sceneProvider,ttsProvider}.ts
      character/{CharacterRenderer.ts,Sprite2DRenderer.tsx}
      storage/{itemRepository.ts,...}
      supabase/client.ts
    characters/default/{persona.md,sprites/,voice.json}
    store/    # zustand
    styles/  types/
  public/
  .env.example
  spec.md  claude.md
```

## 9. プライバシー方針
- 個人情報（メール/氏名等）を**収集しない**（匿名認証）。
- カメラの**元写真を永続保存しない**（生成アイコンのみ保存、元画像は確定後破棄）。
- 入力は**ライブ撮影のみ**（モニター撮り等は世界観で自然抑制、厳密判定はしない）。
- APIキーは**サーバ側（Vercel Functions）にのみ保持**。

## 10. デザイン
- トーン：ポップ＆カラフル。丸み・余白・やわらかい影。
- **推奨フォント（すべてGoogle Fonts・無料・商用可）**
  - 日本語UI/本文：**M PLUS Rounded 1c** または **Zen Maru Gothic**（丸ゴシックで親しみやすい）
  - 英数の見出し/アクセント：**Fredoka** または **Baloo 2**（丸くてポップ）
- カラーパレット案（パステル＋差し色）：ミント `#6EE7B7` / ラベンダー `#C4B5FD` / ピーチ `#FDA4AF` / レモン `#FDE68A` / ベース白＋やわらかグレー。
- レア度・合成成功などは色とアニメーションで気持ちよく演出。

## 11. ネイティブアプリ化の方針
- **Capacitor** を採用予定（Vite/React のビルドをそのままラップし、iOS/Android のネイティブカメラ・通知へアクセス）。
- まず **PWA 対応**を入れておくと移行が滑らか。
- ネイティブ機能（カメラ等）はアダプタ層越しに呼び、Web実装と差し替え可能にする。

## 12. 非機能要件
- 生成中のUX：妖精が「鑑定中…」など演出しつつローディング。
- コスト管理：Functions側で**レート制限/1日あたり生成上限**を設ける。
- エラー時：生成失敗・API不通でも妖精のセリフで自然にフォロー。

## 13. ロードマップ
> STEP 単位の詳細・最新の進捗は [ROADMAP.md](./ROADMAP.md)（そちらが正）。下記は粗い区分のみ。
> 実態の進捗：STEP0〜5＋STEP7 完了（会話・撮影アイテム化・IndexedDB図鑑・感情リアクション・風景コメント）。STEP6 音声は⏸保留（TTSサービス選定中）。
- **MVP**：匿名認証／カメラ撮影→アイコン化＋名前説明→図鑑登録／ホームの会話／妖精2D表示＋音声。
- **v1**：妖精の窯（合成）／風景コメント／図鑑の検索・絞り込み。
- **拡張**：キャラ差し替えUI／アップロード解禁オプション／PWA→Capacitorネイティブ化／（必要なら）メール連携でのデータ引き継ぎ。

## 14. 製品の方向性・リテンション設計（将来検討。確定機能仕様ではない）
> 本章は**製品の軸＝方針**であり、§1〜§13 のような確定機能仕様ではない。実装の単位は [ROADMAP.md](./ROADMAP.md) のバックログ参照。機能カタログ（§4〜§13）から切り分けて記す。

- **差別化の一行**：参考アプリ SELF が "内面" に寄り添うのに対し、any-collect は **"世界（外）" を一緒に冒険して寄り添う**。収集という共同作業が、相棒の妖精との関係に具体的な土台を与える。
- **勝ち筋（最重要の設計軸）**：会話型アプリは続けるとパターンが読めて "会話の燃料切れ" になりやすい。any-collect はこれを構造的に解決する → **① LLM の開放的生成（定型選択肢でない）＋ ② 入力源＝"現実スキャン"（無限・外部由来・予測不能）**。内面でなく世界そのものが燃料なので枯れにくい。
- **リテンション機構の候補**（毎日開く理由）：
  - **妖精が図鑑を知って言及**（例「最近 鉱石ばっかりだね」）＝知ろうとする→自己肯定感。
  - **今日のおだい**：時間/天気/位置のコンテキスト連動プロアクティブ（例「雨だね、今日は家の中で何か」）。
  - **絆レベル**：収集で上昇 → 表情/新妖精/能力 解放（"集めた後の、で何?" への回答）。**表示側の level-aware は実装済み（§4.1.3）、源の配線は未**。
  - **図鑑＝絵日記/思い出アルバム**：墓場にしない（例「1ヶ月前の今日これ見つけたね」）。
  - **記憶の永続＝課金価値**：将来マネタイズも妖精の記憶/絆が自然（ただし "記憶を人質" 型は避ける）。
- **現状診断**：いまは「ジェネレーター・トイ」止まりで、まだ "ゲームのループ" になっていない。リビール（撮る→何になる?）は強いが減衰が速い。**ループ化が次の課題**。
- **設計インパクト**：① 図鑑の意味を "保存" → "妖精の記憶素材/絵日記" に格上げ。② プロアクティブ通知は Web で弱い → **Capacitor ネイティブ化の主目的＝通知で開く理由を作る**。③ 寄り添いを出すなら persona の作り込みが効く。

## 15. 未確定 / 将来検討
- アプリ正式名称・妖精のデフォルトキャラ設定。
- レア度の体系（カテゴリは7キー `food/creature/nature/gear/toy/wear/other` に確定＝`src/lib/category.ts` / `api/_lib/item-prompt.ts`）。
- 図鑑のソーシャル要素（共有等）の是非。
- **イベント/トリガー機能**：行動・状況起点で妖精がイベントを起こす（例：道に迷う→コンパス付与）。詳細は ROADMAP のバックログ参照。STEP4 以降に独立 STEP として追加想定。
