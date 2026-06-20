# sprites — 妖精の表情/ポーズ差分イラスト置き場

`Sprite2DRenderer` はこのフォルダの PNG を自動で読み込みます（`src/lib/character/Sprite2DRenderer.tsx`）。
ファイルを置いて dev サーバを再読込すれば反映されます。画像が無い感情は `neutral` に、
`neutral` も無ければ絵文字プレースホルダーにフォールバックします。

## 置き方（2通り・どちらでも可）

### ① 感情ごとのフォルダ（推奨）
同じ感情に**何枚でも**ポーズ差分を入れられます。ファイル名は自由。
表示のたびにランダムで1枚選ばれ、**連続で同じ絵は出ません**（飽き対策）。

```
sprites/
  happy/        ← happy 系を好きなだけ
    a.png
    b.png
    wave.png
  excited/
    jump.png
    sparkle.png
  neutral.png   ← 直置きもOK（②と混在可）
```

### ② 1感情1枚（後方互換）
`sprites/<感情>.png` の直置き。`happy-1.png` のように末尾 `-数字` を付けてフラットに
複数バリエにしても、同じ感情としてまとめてランダム選択されます。

## 感情キー一覧
感情キーの正は `src/lib/character/CharacterRenderer.ts` の `FAIRY_EXPRESSIONS`。

| 感情キー | 表情 | 主な用途 |
|---|---|---|
| `neutral` | ふつう | 既定。最低これ1枚あればOK |
| `happy` | うれしい | 生成成功・通常の収集 |
| `surprised` | おどろき | レア発見など |
| `thinking` | かんがえ中 | 鑑定中・ローディング |
| `sad` | しょんぼり | 失敗・エラー時 |
| `excited` | 大興奮 | 高レア・新カテゴリ初取得 |

## 感情を増やしたいとき
1. `src/lib/character/CharacterRenderer.ts` の `FAIRY_EXPRESSIONS` に 1 語追加
2. （任意）`Sprite2DRenderer.tsx` の `REACTION_ANIMATION` に一発アニメを対応づけ
3. このフォルダに `sprites/<新しい感情>/` を作って絵を置く

## 推奨スペック
- **形式**: PNG、**背景は透過（アルファ）**
- **サイズ**: 1024×1024（正方形）。アプリ表示は最大 ~176px なので 512px でも可
- **画風の統一**: 全カット**同じキャラ・同じ画風**で（ベース絵を毎回参照し、ブレた絵は弾く）。
  ポーズ差分は同一感情フォルダ内なら自由に動かしてOK（外側ラッパで常時フワフワ浮遊が掛かる）
- **余白**: 見切れないよう周囲に余白を残す
