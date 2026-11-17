import { NoviaLogo } from '../brand/Logo'
import { useAppStore } from '@/store/useAppStore'

export function Splash() {
  const error = useAppStore((s) => s.error)
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-5 text-center">
        <NoviaLogo height={44} />
        {error ? (
          <div className="max-w-sm">
            <p className="font-semibold text-red-700">Chargement impossible</p>
            <p className="mt-1 text-sm text-ink-2">{error}</p>
          </div>
        ) : (
          <div className="h-1 w-40 overflow-hidden rounded-full bg-line">
            <div className="h-full w-1/3 animate-[splash_1.1s_ease-in-out_infinite] rounded-full bg-novia-600" />
          </div>
        )}
      </div>
      <style>{'@keyframes splash{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
    </div>
  )
}
