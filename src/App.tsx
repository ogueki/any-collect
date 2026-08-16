import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { useOnboardingStore } from './store/onboardingStore'
import { syncBgm, pauseBgm } from './lib/audio/bgm'
import { installAudioUnlock } from './lib/audio/useSpeak'
import OnboardingOverlay from './features/onboarding/OnboardingOverlay'
import HomeMode from './features/home/HomeMode'
import CameraMode from './features/camera/CameraMode'
import WorkingScreen from './components/WorkingScreen'
import MenuSheet from './components/MenuSheet'
import CollectionView from './features/collection/CollectionView'
import AlbumView from './features/album/AlbumView'
import KilnView from './features/kiln/KilnView'
import TreasureBoxView from './features/treasure/TreasureBoxView'
import TowerGame from './features/game/TowerGame'
import FlappyGame from './features/game/FlappyGame'

export default function App() {
  const screen = useAppStore((s) => s.screen)
  const game = useAppStore((s) => s.game)
  const go = useAppStore((s) => s.go)
  const closeGame = useAppStore((s) => s.closeGame)
  // 初回だけ：コレット主導の導入オーバーレイを最前面に出す（撮影ガイドは CameraMode 側）。
  const onboardingPhase = useOnboardingStore((s) => s.phase)

  // BGM（音の床）を画面に追従させる。同じ曲のままなら鳴らし直さないので、
  // ホーム↔図鑑↔アルバムを行き来しても曲は途切れない（判定は bgm.ts）。
  const characterId = useAppStore((s) => s.characterId)
  const voiceEnabled = useAppStore((s) => s.voiceEnabled)
  useEffect(() => {
    syncBgm(characterId, screen, game, onboardingPhase === 'intro')
  }, [characterId, screen, game, onboardingPhase, voiceEnabled])

  // 自動再生には**必ずユーザー操作が要る**（ブラウザの規約＝読み込んだ瞬間には鳴らせない）。
  // せめて「最初の操作」を取りこぼさないよう、画面のどこを触っても1回だけアンロックする。
  useEffect(() => installAudioUnlock(), [])

  // タブが隠れているあいだは止める（電池と行儀）。戻ったら上の効果が鳴らし直す。
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pauseBgm()
      else syncBgm(characterId, screen, game, onboardingPhase === 'intro')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [characterId, screen, game, onboardingPhase])

  return (
    // max-w-md＋中央寄せ＝タブレット/PC でも SP レイアウトのまま表示（iPad 専用レイアウトは作らない・2026-07-19）
    <div className="relative mx-auto h-full max-w-md overflow-hidden">
      {screen === 'home' && <HomeMode />}
      {screen === 'camera' && <CameraMode />}
      {screen === 'collection' && (
        <WorkingScreen title="ずかん">
          <CollectionView />
        </WorkingScreen>
      )}
      {screen === 'album' && (
        <WorkingScreen title="アルバム">
          <AlbumView />
        </WorkingScreen>
      )}
      {screen === 'kiln' && (
        <WorkingScreen title="妖精の窯">
          <KilnView onGoTreasure={() => go('treasure')} />
        </WorkingScreen>
      )}
      {screen === 'treasure' && (
        <WorkingScreen title="たからばこ" bleed tone="dark">
          <TreasureBoxView />
        </WorkingScreen>
      )}

      <MenuSheet />
      {game === 'tower' && <TowerGame onClose={closeGame} />}
      {game === 'flappy' && <FlappyGame onClose={closeGame} />}

      {onboardingPhase === 'intro' && <OnboardingOverlay />}
    </div>
  )
}
