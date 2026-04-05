import { Gauge, Shield, TimerReset, Zap } from 'lucide-react'
import { FIRE_COOLDOWN, formatSol } from '../config/game'
import { useGameStore } from '../game/store'
import { cn } from '../lib/cn'

function Meter({
  label,
  value,
  max = 100,
  accent,
}: {
  label: string
  value: number
  max?: number
  accent: string
}) {
  const width = Math.max(0, Math.min(100, (value / max) * 100))

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="hud-label">{label}</span>
        <span className="display-text fluid-display-xs text-white">{Math.max(0, Math.round(value))}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{
            width: `${width}%`,
            background: accent,
            boxShadow: `0 0 18px ${accent}`,
          }}
        />
      </div>
    </div>
  )
}

function PilotHud({
  title,
  hp,
  shieldValue,
  accentClass,
  align = 'left',
}: {
  title: string
  hp: number
  shieldValue: number
  accentClass: string
  align?: 'left' | 'right'
}) {
  return (
    <div className={cn('rounded-[22px] border border-white/10 bg-slate-950/58 px-4 py-4 backdrop-blur-xl', align === 'right' && 'text-right')}>
      <div className="hud-label mb-2">Pilot</div>
      <div className="display-text fluid-display-sm text-white">{title}</div>
      <div className="mt-4 space-y-3">
        <Meter label="Hull" value={hp} accent={accentClass} />
        <Meter label="Shield" value={shieldValue} max={35} accent="rgba(255,255,255,0.7)" />
      </div>
    </div>
  )
}

export function HudOverlay() {
  const stage = useGameStore((state) => state.stage)
  const timerLeft = useGameStore((state) => state.timerLeft)
  const countdownValue = useGameStore((state) => state.countdownValue)
  const prizePool = useGameStore((state) => state.prizePool)
  const localPilotId = useGameStore((state) => state.localPilotId)
  const pilots = useGameStore((state) => state.pilots)

  const localPilot = pilots[localPilotId]
  const remotePilot = pilots[localPilotId === 'blue' ? 'violet' : 'blue']
  const cooldownReady = Math.max(0, 100 - (localPilot.cooldown / FIRE_COOLDOWN) * 100)

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-3 pt-3 md:px-6 md:pt-6">
        <PilotHud
          title={localPilot.label}
          hp={localPilot.health}
          shieldValue={localPilot.shield}
          accentClass="rgba(96,165,250,0.95)"
        />

        <div className="rounded-[22px] border border-white/10 bg-slate-950/58 px-5 py-4 text-center backdrop-blur-xl">
          <div className="hud-label mb-2 flex items-center justify-center gap-2">
            <TimerReset className="h-3.5 w-3.5" />
            Match
          </div>
          <div className="display-text fluid-display-md text-white">
            {stage === 'countdown' ? countdownValue : timerLeft.toFixed(0).padStart(2, '0')}
          </div>
          <div className="mt-2 tech-text text-slate-300/68">
            Prize Pool {formatSol(prizePool)}
          </div>
        </div>

        <PilotHud
          title={remotePilot.label}
          hp={remotePilot.health}
          shieldValue={remotePilot.shield}
          accentClass="rgba(167,139,250,0.95)"
          align="right"
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4 md:pb-6">
        <div className="grid w-full max-w-3xl gap-3 md:grid-cols-3">
          <div className="rounded-[20px] border border-white/10 bg-slate-950/58 px-4 py-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-300" />
              <span className="hud-label">Boost</span>
            </div>
            <Meter label="Reserve" value={localPilot.boost} accent="rgba(96,165,250,0.95)" />
          </div>

          <div className="rounded-[20px] border border-white/10 bg-slate-950/58 px-4 py-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-violet-300" />
              <span className="hud-label">Laser</span>
            </div>
            <Meter label="Recharge" value={cooldownReady} accent="rgba(167,139,250,0.95)" />
          </div>

          <div className="rounded-[20px] border border-white/10 bg-slate-950/58 px-4 py-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-white/80" />
              <span className="hud-label">Status</span>
            </div>
            <div className="display-text fluid-display-sm text-white">
              {stage === 'countdown' ? 'Launch' : 'Engaged'}
            </div>
            <div className="mt-2 tech-text text-slate-300/68">
              Keep the enemy in front, strafe wide, dodge laser lines, and punish on cooldown.
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="relative h-10 w-10">
          <div className="absolute left-1/2 top-1/2 h-10 w-[1px] -translate-x-1/2 -translate-y-1/2 bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.28)]" />
          <div className="absolute left-1/2 top-1/2 h-[1px] w-10 -translate-x-1/2 -translate-y-1/2 bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.28)]" />
          <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-white/10" />
        </div>
      </div>
    </>
  )
}
