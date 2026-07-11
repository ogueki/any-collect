import { useAppStore } from './store/appStore'
import HomeMode from './features/home/HomeMode'
import CameraMode from './features/camera/CameraMode'
import WorkingScreen from './components/WorkingScreen'
import MenuSheet from './components/MenuSheet'
import CollectionView from './features/collection/CollectionView'
import AlbumView from './features/album/AlbumView'
import KilnView from './features/kiln/KilnView'
import RealmView from './features/realm/RealmView'
import TowerGame from './features/game/TowerGame'
import FlappyGame from './features/game/FlappyGame'

export default function App() {
  const screen = useAppStore((s) => s.screen)
  const game = useAppStore((s) => s.game)
  const go = useAppStore((s) => s.go)
  const closeGame = useAppStore((s) => s.closeGame)

  return (
    <div className="relative h-full overflow-hidden">
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
          <KilnView onReaction={() => {}} onGoRealm={() => go('realm')} />
        </WorkingScreen>
      )}
      {screen === 'realm' && (
        <WorkingScreen title="妖精界">
          <RealmView />
        </WorkingScreen>
      )}

      <MenuSheet />
      {game === 'tower' && <TowerGame onClose={closeGame} />}
      {game === 'flappy' && <FlappyGame onClose={closeGame} />}
    </div>
  )
}
