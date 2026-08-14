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

interface VoiceManifest {
  /** 台本の固定セリフ（画面に同じ文字が出るので突き合わせが要る）。 */
  lines?: Record<string, VoiceManifestEntry>
  /** リアクションボイス（感情→ハッシュ→文面）。**文字は画面に出ない**ので突き合わせは不要。 */
  reactions?: Record<string, Record<string, string>>
}

// 収録音声とその manifest をビルドに取り込む（スプライトと同じ eager glob 方式）。
// `voice/<lineId>.mp3`（台本）と `voice/<感情>/<hash>.mp3`（掛け声）の両方を拾う。
const voiceModules = import.meta.glob('../../characters/*/voice/**/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const manifestModules = import.meta.glob('../../characters/*/voice/manifest.json', {
  eager: true,
  import: 'default',
}) as Record<string, VoiceManifest>

/**
 * `.../characters/<charId>/voice/<file>` または `.../voice/<感情>/<file>` を分解する。
 * `emotion` があれば掛け声、無ければ台本のセリフ。
 */
function parsePath(path: string): { charId: string; emotion?: string; name: string } | null {
  const m = /characters\/([^/]+)\/voice\/(?:([^/]+)\/)?([^/]+)\.[^./]+$/.exec(path)
  return m ? { charId: m[1], emotion: m[2], name: m[3] } : null
}

/** charId → lineId → 音声URL（台本のセリフ）。 */
const urlIndex: Record<string, Record<string, string>> = {}
/** charId → 感情 → 音声URL の配列（掛け声。ランダムに1本選ぶ）。 */
const reactionIndex: Record<string, Record<string, string[]>> = {}
for (const [path, url] of Object.entries(voiceModules)) {
  const parsed = parsePath(path)
  if (!parsed) continue
  if (parsed.emotion) {
    ;((reactionIndex[parsed.charId] ??= {})[parsed.emotion] ??= []).push(url)
  } else {
    ;(urlIndex[parsed.charId] ??= {})[parsed.name] = url
  }
}
// glob の並びはビルド依存なので、選び方が環境で変わらないよう固定する。
for (const byEmotion of Object.values(reactionIndex)) {
  for (const urls of Object.values(byEmotion)) urls.sort()
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

  const recorded = manifestIndex[characterId]?.lines?.[line.id]
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

/** 感情ごとに直前に鳴らした掛け声。2連続で同じものを引かないために覚えておく。 */
const lastReaction: Record<string, string> = {}

/**
 * その感情の掛け声を1本ランダムに選ぶ（**直前と同じものは避ける**）。収録が無ければ null。
 * 立ち絵（`Sprite2DRenderer`）の感情フォルダからのランダム選択と同じ考え方＝
 * `voice/<感情>/` にファイルを足すだけで候補が増える。
 */
export function pickReactionVoice(characterId: string, expression: string): string | null {
  const urls = reactionIndex[characterId]?.[expression]
  if (!urls || urls.length === 0) return null

  const key = `${characterId}/${expression}`
  const candidates = urls.length > 1 ? urls.filter((u) => u !== lastReaction[key]) : urls
  const picked = candidates[Math.floor(Math.random() * candidates.length)]
  lastReaction[key] = picked
  return picked
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
