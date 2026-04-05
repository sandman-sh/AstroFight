import { useRef } from 'react'

interface MobileControlsProps {
  onMove: (x: number, y: number) => void
  onBoost: (active: boolean) => void
  onFire: (active: boolean) => void
  onAimDelta: (dx: number, dy: number) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function MobileControls({
  onMove,
  onBoost,
  onFire,
  onAimDelta,
}: MobileControlsProps) {
  const moveOrigin = useRef<{ x: number; y: number } | null>(null)
  const aimOrigin = useRef<{ x: number; y: number } | null>(null)

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex items-end justify-between px-4 pb-5 md:hidden">
      <div
        className="pointer-events-auto touch-none rounded-[30px] border border-cyan-300/14 bg-black/35 p-3 shadow-[0_14px_40px_rgba(0,0,0,0.35)] backdrop-blur"
        onPointerDown={(event) => {
          moveOrigin.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerMove={(event) => {
          if (!moveOrigin.current) return
          const dx = clamp((event.clientX - moveOrigin.current.x) / 40, -1, 1)
          const dy = clamp((moveOrigin.current.y - event.clientY) / 40, -1, 1)
          onMove(dx, dy)
        }}
        onPointerUp={() => {
          moveOrigin.current = null
          onMove(0, 0)
        }}
      >
        <div className="flex h-28 w-28 items-center justify-center rounded-full border border-cyan-300/14 bg-[radial-gradient(circle_at_center,rgba(96,165,250,0.18),rgba(255,255,255,0.04))]">
          <div className="h-10 w-10 rounded-full border border-cyan-200/20 bg-cyan-100/12" />
        </div>
      </div>

      <div className="pointer-events-auto flex items-end gap-3">
        <div
          className="touch-none rounded-[30px] border border-violet-300/16 bg-black/35 p-4 shadow-[0_14px_40px_rgba(0,0,0,0.35)] backdrop-blur"
          onPointerDown={(event) => {
            aimOrigin.current = { x: event.clientX, y: event.clientY }
          }}
          onPointerMove={(event) => {
            if (!aimOrigin.current) return
            onAimDelta(
              (event.clientX - aimOrigin.current.x) / 180,
              (aimOrigin.current.y - event.clientY) / 180,
            )
            aimOrigin.current = { x: event.clientX, y: event.clientY }
          }}
          onPointerUp={() => {
            aimOrigin.current = null
          }}
        >
          <div className="h-24 w-24 rounded-[22px] border border-violet-300/12 bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.14),rgba(255,255,255,0.03))]" />
        </div>

        <div className="flex flex-col gap-3">
          <button
            className="touch-none rounded-[18px] border border-cyan-300/20 bg-cyan-300/12 px-5 py-4 text-xs uppercase tracking-[0.22em] text-cyan-100"
            onPointerDown={() => onBoost(true)}
            onPointerUp={() => onBoost(false)}
          >
            Boost
          </button>
          <button
            className="touch-none rounded-[18px] border border-violet-300/20 bg-violet-300/14 px-5 py-4 text-xs uppercase tracking-[0.22em] text-violet-100"
            onPointerDown={() => onFire(true)}
            onPointerUp={() => onFire(false)}
          >
            Fire
          </button>
        </div>
      </div>
    </div>
  )
}
