/**
 * パートボイス（事前収録の固定セリフ）の索引（STEP3b／Ⅰ-6）。
 *
 * 動的TTS は生成に1〜3秒かかるので、オンボの1言目や図鑑リビールでは
 * **文字が先に出て声が遅れて追いつく**（＝間が抜ける）。台本は固定なので事前に録っておき、
 * 静的アセットとして即座に鳴らす＝**実行時ゼロ円＋レイテンシほぼゼロ**。
 *
 * 素材は `src/characters/<id>/voice/<lineId>.mp3` ＋ `manifest.json`（`npm run voice:record` が生成）。
 * **キャラ差し替え単位**（claude.md 原則4）＝新キャラは自分の `voice/` を持てばそのまま鳴る。
 *
 * **肝＝収録時の台本を manifest に控えておき、再生前に今の台本と突き合わせる。**
 * 台本（`script.ts`）は非コーダーが直接編集する前提なので、文面を直したのに録り直していない状態が
 * 必ず起きる。そのとき古い音声を鳴らすと**画面の文字と違うことを喋る**＝いちばん悪い壊れ方になる。
 * 一致しなければ黙って動的TTS に落ちる（音は少し遅れるが、必ず正しいことを喋る）。
 */

/** 事前収録の対象になりうるセリフ。台本の `OnboardingStep` はこれを満たす。 */
export interface SpokenLine {
  /** 収録ファイル名になる安定ID。 */
  id: string
  text: string
  /** 立ち絵と同じ感情（`FairyExpression`）。 */
  expression: string
  /** 読み方の演技指示。 */
  direction: string
}

/** `manifest.json` の1件＝「この文面・この演出で録った」という記録。 */
interface VoiceManifestEntry {
  text: string
  expression: string
  direction: string
  /** 収録日時（ISO）。人が見るためだけの情報で、判定には使わない。 */
  recordedAt?: string
}

type VoiceManifest = Record<string, VoiceManifestEntry>

// 収録音声とその manifest をビルドに取り込む（スプライトと同じ eager glob 方式）。
const voiceModules = import.meta.glob('../../characters/*/voice/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const manifestModules = import.meta.glob('../../characters/*/voice/manifest.json', {
  eager: true,
  import: 'default',
}) as Record<string, VoiceManifest>

/** `.../characters/<charId>/voice/<file>` から charId と拡張子なしのファイル名を取り出す。 */
function parsePath(path: string): { charId: string; name: string } | null {
  const m = /characters\/([^/]+)\/voice\/([^/]+)\.[^./]+$/.exec(path)
  return m ? { charId: m[1], name: m[2] } : null
}

/** charId → lineId → 音声URL。 */
const urlIndex: Record<string, Record<string, string>> = {}
for (const [path, url] of Object.entries(voiceModules)) {
  const parsed = parsePath(path)
  if (!parsed) continue
  ;(urlIndex[parsed.charId] ??= {})[parsed.name] = url
}

/** charId → manifest。 */
const manifestIndex: Record<string, VoiceManifest> = {}
for (const [path, manifest] of Object.entries(manifestModules)) {
  const parsed = parsePath(path)
  if (parsed && manifest && typeof manifest === 'object') manifestIndex[parsed.charId] = manifest
}

/**
 * このセリフの事前収録がそのまま使えるなら音声URLを返す。使えないなら null（＝動的TTSへ）。
 * 「使える」＝ファイルがあり、かつ**収録時の文面・感情・演技指示が今の台本と完全一致**すること。
 */
export function findPartVoice(characterId: string, line: SpokenLine): string | null {
  const url = urlIndex[characterId]?.[line.id]
  if (!url) return null

  const recorded = manifestIndex[characterId]?.[line.id]
  if (!recorded) return null
  if (
    recorded.text !== line.text ||
    recorded.expression !== line.expression ||
    recorded.direction !== line.direction
  ) {
    return null
  }
  return url
}

/**
 * これから鳴らすセリフの音声を先に取りに行っておく（HTTPキャッシュを温める）。
 * オンボは「はい」を押した直後から立て続けに喋るので、そこで一括で温めておくと初回も待たない。
 * 失敗は無視＝温まらなくても再生時に取りに行くだけ。
 */
export function preloadPartVoice(characterId: string, lines: SpokenLine[]): void {
  for (const line of lines) {
    const url = findPartVoice(characterId, line)
    if (url) void fetch(url).catch(() => {})
  }
}
