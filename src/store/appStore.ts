import { create } from 'zustand'

/** トップレベルの画面。ホーム⇄カメラが主軸、図鑑/妖精界は入口、アルバム/窯はメニュー経由。 */
export type Screen = 'home' | 'camera' | 'collection' | 'album' | 'kiln' | 'realm'
/** 全画面オーバーレイで起動するオマケゲーム（メニューから）。 */
export type Game = 'tower' | 'flappy' | null

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
  setCharacter: (characterId: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'home',
  menuOpen: false,
  game: null,
  voiceEnabled: true,
  characterId: 'default',
  go: (screen) => set({ screen, menuOpen: false }),
  openMenu: () => set({ menuOpen: true }),
  closeMenu: () => set({ menuOpen: false }),
  openGame: (game) => set({ game, menuOpen: false }),
  closeGame: () => set({ game: null }),
  toggleVoice: () => set((s) => ({ voiceEnabled: !s.voiceEnabled })),
  setCharacter: (characterId) => set({ characterId }),
}))
