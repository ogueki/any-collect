/**
 * BGM（音の床）。
 *
 * **声だけが無音の上に鳴ると「人の声」でなく「システム音」に聞こえる。**
 * ゲームでもVNでも、キャラの声が完全な無音に単独で乗ることはまずなく、必ず
 * 音楽か環境音の層があってその上に声が乗る。床があると声はその空間の中の出来事になり、
 * 無いと通知音と同じカテゴリに落ちる。掛け声（`speakReaction`）が寂しく聞こえた原因はここ。
 *
 * 素材は `src/characters/<id>/bgm/<シーン>.mp3`＝**キャラ差し替え単位**（claude.md 原則4）。
 * 背景（`backgrounds/`）と対になるものなのでキャラ配下に置く。
 * **ファイルを置くだけで有効になる**（スプライト・掛け声と同じ流儀）＝無いシーンは黙る。
 *
 * ON/OFF は声と同じ `appStore.voiceEnabled` に相乗りする（設定を増やさない）。
 */

import { useAppStore } from '../../store/appStore'
import type { Screen } from '../../store/appStore'

/** 通常の音量。声の下に敷くので最初から控えめにする。 */
const BASE_VOLUME = 0.35
/**
 * 声が鳴っているあいだ下げる音量（ダッキング）。
 * 放送・映画で標準の手法で、**これがないと BGM を足したぶん声が埋もれる**。
 * 単に静かにするのではなく、声が「音の床に支えられている」ようにするのが狙い。
 */
const DUCKED_VOLUME = 0.12
/** 音量を動かす時間（ms）。急に切り替えると段差が耳につく。 */
const FADE_MS = 220

const bgmModules = import.meta.glob('../../characters/*/bgm/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** charId → シーン名 → URL。 */
const index: Record<string, Record<string, string>> = {}
for (const [path, url] of Object.entries(bgmModules)) {
  const m = /characters\/([^/]+)\/bgm\/([^/]+)\.[^./]+$/.exec(path)
  if (m) (index[m[1]] ??= {})[m[2]] = url
}

/**
 * いまの画面で鳴らすべき曲のキー。`null` は無音。
 *
 * - **カメラは無音**＝屋外で現実の音が鳴っている場所なので床を足す必要がない。
 * - **ゲームは専用曲があるときだけ**＝ホームのヒーリング系は合わない。`game.mp3` を置けば鳴る。
 * - ホーム系（会話・図鑑・アルバム・釜）とオンボは同じ床でつながる（画面を移っても切れない）。
 */
export function bgmKeyFor(screen: Screen, game: string | null, onboarding: boolean): string | null {
  if (game) return 'game'
  if (onboarding) return 'home'
  if (screen === 'camera') return null
  if (screen === 'treasure') return 'treasure'
  return 'home'
}

/** そのキーの音源を引く。`treasure` は専用曲が無ければホームの曲でつなぐ（ゲームは繋がない）。 */
function resolveUrl(characterId: string, key: string): string | null {
  const byKey = index[characterId]
  if (!byKey) return null
  if (byKey[key]) return byKey[key]
  return key === 'treasure' ? (byKey.home ?? null) : null
}

let player: HTMLAudioElement | null = null
let currentUrl: string | null = null
let fadeTimer: number | null = null
let ducked = false
/**
 * **「いま鳴っているべきか」の唯一の真実。**
 *
 * `play()` は非同期で、再生の準備中に `pause()` を呼んでも**後から解決した `play()` が勝って
 * 鳴り続けることがある**（BGM が鳴り始めた直後にカメラへ移ると止まらない＝タイミング勝負なので
 * 再現条件が掴めない形で出る）。要素の `paused` を見るだけでは足りないので、こちらで意図を持ち、
 * `play()` が解決した後に**もう一度突き合わせて**意図と違えば止める。
 */
let shouldPlay = false

function getPlayer(): HTMLAudioElement {
  if (!player) {
    const a = new Audio()
    a.loop = true
    a.preload = 'auto'
    a.volume = BASE_VOLUME
    ;(a as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true
    player = a
  }
  return player
}

/** 意図（`shouldPlay`）どおりの状態にする。`play()` の解決後に必ず再確認するのが肝。 */
function applyPlayState(): void {
  const p = getPlayer()
  if (!shouldPlay) {
    p.pause()
    return
  }
  if (!p.paused) return
  void p
    .play()
    .then(() => {
      // 待っているあいだに「止めるべき」に変わっていたら、ここで止める。
      // これが無いと、鳴り始めた直後の画面遷移で止め損ねる。
      if (!shouldPlay) p.pause()
    })
    .catch(() => {
      // 自動再生がまだ許可されていない＝次のユーザー操作で鳴り出す。
    })
}

/** 目標音量までなめらかに動かす。 */
function fadeTo(target: number): void {
  const p = getPlayer()
  if (fadeTimer !== null) window.clearInterval(fadeTimer)
  const step = 20
  const delta = (target - p.volume) / (FADE_MS / step)
  fadeTimer = window.setInterval(() => {
    const next = p.volume + delta
    const done = delta >= 0 ? next >= target : next <= target
    p.volume = done ? target : Math.min(1, Math.max(0, next))
    if (done && fadeTimer !== null) {
      window.clearInterval(fadeTimer)
      fadeTimer = null
    }
  }, step)
}

/**
 * 画面に合わせて BGM を切り替える。同じ曲なら鳴らし直さない
 * （ホーム↔図鑑↔アルバムを行き来しても**曲は途切れない**）。
 */
export function syncBgm(
  characterId: string,
  screen: Screen,
  game: string | null,
  onboarding: boolean,
): void {
  const p = getPlayer()

  if (!useAppStore.getState().voiceEnabled) {
    shouldPlay = false
    applyPlayState()
    return
  }

  const key = bgmKeyFor(screen, game, onboarding)
  const url = key ? resolveUrl(characterId, key) : null

  if (!url) {
    shouldPlay = false
    currentUrl = null
    applyPlayState()
    return
  }

  if (url !== currentUrl) {
    currentUrl = url
    p.src = url
    p.volume = ducked ? DUCKED_VOLUME : BASE_VOLUME
  }
  shouldPlay = true
  applyPlayState()
}

/** 声が鳴り始めたら床を下げる。 */
export function duckBgm(): void {
  if (ducked) return
  ducked = true
  if (player && !player.paused) fadeTo(DUCKED_VOLUME)
}

/** 声が終わったら床を戻す。 */
export function unduckBgm(): void {
  if (!ducked) return
  ducked = false
  if (player && !player.paused) fadeTo(BASE_VOLUME)
}

/**
 * 自動再生のアンロック。声の `primeAudio()` と**同じユーザー操作の中で**呼ぶ。
 * BGM は声とは別の `<audio>` なので、別々にアンロックが要る。
 */
export function primeBgm(): void {
  if (!getPlayer().src) return
  applyPlayState()
}

/** タブが隠れているあいだは止める（電池と行儀）。復帰時は `syncBgm` が鳴らし直す。 */
export function pauseBgm(): void {
  shouldPlay = false
  applyPlayState()
}
