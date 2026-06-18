import { create } from 'zustand'

export type AppMode = 'home' | 'camera' | 'codex'

interface AppState {
  /** 現在のモード */
  mode: AppMode
  /** 音声読み上げの ON/OFF */
  voiceEnabled: boolean
  /** 選択中の妖精キャラ ID（characters/<id>/） */
  characterId: string
  setMode: (mode: AppMode) => void
  toggleVoice: () => void
  setCharacter: (characterId: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  mode: 'home',
  voiceEnabled: true,
  characterId: 'default',
  setMode: (mode) => set({ mode }),
  toggleVoice: () => set((s) => ({ voiceEnabled: !s.voiceEnabled })),
  setCharacter: (characterId) => set({ characterId }),
}))
