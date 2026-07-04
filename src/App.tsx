import { useAppStore } from './store/appStore'
import HomeMode from './features/home/HomeMode'
import CameraMode from './features/camera/CameraMode'
import ModeSwitcher from './components/ModeSwitcher'

export default function App() {
  const mode = useAppStore((s) => s.mode)

  return (
    <div className="flex h-full flex-col">
      <main className="relative flex-1 overflow-hidden">
        {mode === 'home' && <HomeMode />}
        {mode === 'camera' && <CameraMode />}
      </main>
      <ModeSwitcher />
    </div>
  )
}
