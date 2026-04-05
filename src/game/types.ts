export type PilotId = 'blue' | 'violet'
export type MatchStage =
  | 'lobby'
  | 'staking'
  | 'countdown'
  | 'battle'
  | 'finished'

export type MatchMode = 'broadcast' | 'bot'

export type EndReason = 'hp' | 'disconnect' | 'timeout'

export type Vector3Tuple = [number, number, number]

export interface PilotState {
  id: PilotId
  label: string
  wallet: string | null
  health: number
  shield: number
  boost: number
  cooldown: number
  connected: boolean
  stakeConfirmed: boolean
  isLocal: boolean
  isBot: boolean
  position: Vector3Tuple
  targetPosition: Vector3Tuple
  velocity: Vector3Tuple
  rotation: number
  targetRotation: number
  lastShotAt: number
}

export interface ProjectileState {
  id: string
  ownerId: PilotId
  authoritative: boolean
  position: Vector3Tuple
  velocity: Vector3Tuple
  life: number
}

export interface EffectState {
  id: string
  kind: 'impact' | 'burst'
  position: Vector3Tuple
  age: number
  maxAge: number
  color: string
}

export interface AimState {
  x: number
  y: number
}

export interface InputState {
  moveX: number
  moveY: number
  aim: AimState
  firing: boolean
  boosting: boolean
}

export interface SnapshotPayload {
  pilotId: PilotId
  position: Vector3Tuple
  velocity: Vector3Tuple
  rotation: number
  health: number
  shield: number
  boost: number
  connected: boolean
}
