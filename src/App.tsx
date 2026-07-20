import { useAppStore } from './store/appStore'
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
        <WorkingScreen title="たからばこ">
          <TreasureBoxView />
        </WorkingScreen>
      )}

      <MenuSheet />
      {game === 'tower' && <TowerGame onClose={closeGame} />}
      {game === 'flappy' && <FlappyGame onClose={closeGame} />}
    </div>
  )
}
