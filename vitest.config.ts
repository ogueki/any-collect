import { defineConfig } from 'vitest/config'

/**
 * テストは**純関数だけ**に絞って入れている（`npm test`）。
 *
 * 狙いは網羅率ではなく「**壊れても画面を見ただけでは気づけない場所**」の固定：
 * 入口ガード（オリジン検査・サニタイズ）／会話履歴の切り詰め／再会の判定／
 * レベル曲線／接地ノートの組み立て。UI とストアの副作用は対象外＝
 * 壊れやすいテストは負債になるので、そこは実機の目視で見る（CLAUDE.md の進め方）。
 *
 * `vite.config.ts` とは別ファイルにしてある＝あちらは dev で `api/` を配信する
 * プラグインを積んでおり、テストには要らないため。
 */
export default defineConfig({
  test: {
    // 対象は純関数なので DOM は要らない（jsdom/happy-dom を足さない）。
    environment: 'node',
    include: ['{src,api}/**/*.test.ts'],
  },
})
