export const MATCH_DURATION_SECONDS = 90
export const MAX_HEALTH = 100
export const MAX_SHIELD = 35
export const MAX_BOOST = 100
export const LASER_DAMAGE = 14
export const LASER_SPEED = 30
export const FIRE_COOLDOWN = 0.24
export const ARENA_RADIUS = 24
export const SHIP_RADIUS = 1.3
export const SNAPSHOT_INTERVAL_MS = 60
export const DEFAULT_STAKE_SOL = 0.25
export const MIN_SHIP_SEPARATION = 3.2

export interface SpaceObstacleConfig {
  id: string
  position: [number, number, number]
  radius: number
  kind: 'asteroid' | 'planet'
  tint: string
}

export const PILOT_META = {
  blue: {
    id: 'blue',
    label: 'Astra-01',
    accent: '#60a5fa',
    glow: '#1d4ed8',
  },
  violet: {
    id: 'violet',
    label: 'Nyx-02',
    accent: '#a78bfa',
    glow: '#7c3aed',
  },
} as const

export function createRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase()
}

export function formatSol(value: number) {
  return `${value.toFixed(value < 1 ? 2 : 1)} SOL`
}

export const SPACE_OBSTACLES: SpaceObstacleConfig[] = [
  {
    id: 'planet-blue',
    kind: 'planet',
    position: [-16, 0, -2],
    radius: 4.8,
    tint: '#274690',
  },
  {
    id: 'planet-violet',
    kind: 'planet',
    position: [15, 0, 5],
    radius: 4.1,
    tint: '#52357b',
  },
  {
    id: 'asteroid-a',
    kind: 'asteroid',
    position: [-7, 0, 6],
    radius: 2.2,
    tint: '#4b5563',
  },
  {
    id: 'asteroid-b',
    kind: 'asteroid',
    position: [7, 0, -5],
    radius: 2.4,
    tint: '#374151',
  },
  {
    id: 'asteroid-c',
    kind: 'asteroid',
    position: [6, 0, 15],
    radius: 1.8,
    tint: '#475569',
  },
  {
    id: 'asteroid-d',
    kind: 'asteroid',
    position: [-6, 0, -15],
    radius: 1.8,
    tint: '#475569',
  },
]
