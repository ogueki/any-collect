import { create } from 'zustand'

/** トップレベルの画面。ホーム⇄カメラが主軸、図鑑/たからばこは入口、アルバム/窯はメニュー経由。 */
export type Screen = 'home' | 'camera' | 'collection' | 'album' | 'kiln' | 'treasure'
/** 全画面オーバーレイで起動するオマケゲーム（メニューから）。 */
export type Game = 'tower' | 'flappy' | null

/**
 * 声の ON/OFF は端末に永続する（初回オンボの音声選択と、各画面の 🔊 トグルで決まる）。
 * 音を鳴らせない場所で開く人のために「あとで変更できます」を成立させる＝リロードで ON に戻さない。
 */
const VOICE_KEY = 'anycollect.voice.v1'
function readVoice(): boolean {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(VOICE_KEY) : null
    if (raw === '0') return false
    if (raw === '1') return true
    return true // 未選択の既定＝ON（初回オンボの音声選択で明示的に決まる）
  } catch {
    return true
  }
}
function persistVoice(v: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(VOICE_KEY, v ? '1' : '0')
  } catch {
    // 保存できなくても声自体は動く（次回また既定 ON になるだけ）。
  }
}

interface AppState {
  /** 現在の画面 */
  screen: Screen
  /** メニュー（ボトムシート）が開いているか */
  menuOpen: boolean
  /** 起動中のゲーム（null＝なし） */
  game: Game
  /** 音声読み上げの ON/OFF */
  voiceEnabled: boolean
  /** 選択中の妖精キャラ ID（characters/<id>/） */
  characterId: string
  /** 画面遷移（メニューは閉じる） */
  go: (screen: Screen) => void
  openMenu: () => void
  closeMenu: () => void
  /** ゲーム起動（メニューは閉じる） */
  openGame: (game: Exclude<Game, null>) => void
  closeGame: () => void
  toggleVoice: () => void
  /** 声の ON/OFF を明示指定（初回オンボの「はい/いいえ」で使う）。永続する。 */
  setVoice: (voiceEnabled: boolean) => void
  setCharacter: (characterId: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'home',
  menuOpen: false,
  game: null,
  voiceEnabled: readVoice(),
  characterId: 'default',
  go: (screen) => set({ screen, menuOpen: false }),
  openMenu: () => set({ menuOpen: true }),
  closeMenu: () => set({ menuOpen: false }),
  openGame: (game) => set({ game, menuOpen: false }),
  closeGame: () => set({ game: null }),
  toggleVoice: () =>
    set((s) => {
      const voiceEnabled = !s.voiceEnabled
      persistVoice(voiceEnabled)
      return { voiceEnabled }
    }),
  setVoice: (voiceEnabled) => {
    persistVoice(voiceEnabled)
    set({ voiceEnabled })
  },
  setCharacter: (characterId) => set({ characterId }),
}))
