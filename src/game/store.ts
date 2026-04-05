import { create } from 'zustand'
import {
  DEFAULT_STAKE_SOL,
  MATCH_DURATION_SECONDS,
  MAX_BOOST,
  MAX_HEALTH,
  MAX_SHIELD,
  PILOT_META,
} from '../config/game'
import type {
  EffectState,
  EndReason,
  MatchMode,
  MatchStage,
  PilotId,
  PilotState,
  ProjectileState,
  SnapshotPayload,
  Vector3Tuple,
} from './types'
import type { TransportStatus } from '../network/types'

export interface MatchResultState {
  winnerId: PilotId | null
  reason: EndReason | null
}

export interface RuntimeState {
  roomCode: string
  localPilotId: PilotId
  mode: MatchMode
  stage: MatchStage
  timerLeft: number
  countdownValue: number
  countdownEndsAt: number | null
  matchStartedAt: number | null
  stakeSol: number
  prizePool: number
  transportStatus: TransportStatus
  magicblockLabel: string
  lastSnapshotSentAt: number
  latestStakeLabel: string | null
  result: MatchResultState
  pilots: Record<PilotId, PilotState>
  projectiles: ProjectileState[]
  effects: EffectState[]
  notes: string[]
}

interface RuntimeActions {
  setupMatch: (options: {
    roomCode: string
    localPilotId: PilotId
    mode: MatchMode
    localWallet: string | null
    localLabel?: string | null
  }) => void
  resetMatch: () => void
  setTransportStatus: (status: TransportStatus) => void
  setMagicBlockLabel: (label: string) => void
  setWallet: (pilotId: PilotId, wallet: string | null) => void
  setPilotLabel: (pilotId: PilotId, label: string) => void
  setStakeAmount: (value: number) => void
  confirmStake: (pilotId: PilotId, txLabel?: string | null) => void
  startCountdown: (startsAt: number) => void
  startBattle: () => void
  endMatch: (winnerId: PilotId, reason: EndReason) => void
  disconnectPilot: (pilotId: PilotId) => void
  syncPilotSnapshot: (payload: SnapshotPayload) => void
  applyDamage: (
    targetId: PilotId,
    amount: number,
    position: Vector3Tuple,
    reason?: EndReason,
  ) => void
  setPilotTransform: (
    pilotId: PilotId,
    patch: Partial<
      Pick<
        PilotState,
        'position' | 'velocity' | 'rotation' | 'targetRotation' | 'boost' | 'cooldown'
      >
    >,
  ) => void
  setProjectiles: (projectiles: ProjectileState[]) => void
  pushProjectile: (projectile: ProjectileState) => void
  setEffects: (effects: EffectState[]) => void
  pushEffect: (effect: EffectState) => void
  setTimerLeft: (seconds: number) => void
  setLastSnapshotSentAt: (timestamp: number) => void
  addNote: (note: string) => void
}

function makePilot(
  id: PilotId,
  options: {
    isLocal: boolean
    isBot: boolean
    wallet: string | null
    label?: string | null
  },
): PilotState {
  const spawn = id === 'blue' ? [0, 0, -17] : [0, 0, 17]

  return {
    id,
    label: options.label?.trim() || (options.isBot ? 'Training Drone' : PILOT_META[id].label),
    wallet: options.wallet,
    health: MAX_HEALTH,
    shield: MAX_SHIELD,
    boost: MAX_BOOST,
    cooldown: 0,
    connected: options.isBot ? true : options.isLocal,
    stakeConfirmed: false,
    isLocal: options.isLocal,
    isBot: options.isBot,
    position: [...spawn] as Vector3Tuple,
    targetPosition: [...spawn] as Vector3Tuple,
    velocity: [0, 0, 0],
    rotation: id === 'blue' ? 0 : Math.PI,
    targetRotation: id === 'blue' ? 0 : Math.PI,
    lastShotAt: 0,
  }
}

const initialState: RuntimeState = {
  roomCode: '',
  localPilotId: 'blue',
  mode: 'bot',
  stage: 'lobby',
  timerLeft: MATCH_DURATION_SECONDS,
  countdownValue: 3,
  countdownEndsAt: null,
  matchStartedAt: null,
  stakeSol: DEFAULT_STAKE_SOL,
  prizePool: DEFAULT_STAKE_SOL * 2,
  transportStatus: 'idle',
  magicblockLabel: 'MagicBlock router probing...',
  lastSnapshotSentAt: 0,
  latestStakeLabel: null,
  result: {
    winnerId: null,
    reason: null,
  },
  pilots: {
    blue: makePilot('blue', { isLocal: true, isBot: false, wallet: null }),
    violet: makePilot('violet', { isLocal: false, isBot: true, wallet: null }),
  },
  projectiles: [],
  effects: [],
  notes: ['Create a duel room or launch demo mode to enter the arena.'],
}

export const useGameStore = create<RuntimeState & RuntimeActions>((set, get) => ({
  ...initialState,
  setupMatch: ({ roomCode, localPilotId, mode, localWallet, localLabel }) => {
    const remotePilotId = localPilotId === 'blue' ? 'violet' : 'blue'

    set({
      roomCode,
      localPilotId,
      mode,
      stage: 'lobby',
      timerLeft: MATCH_DURATION_SECONDS,
      countdownValue: 3,
      countdownEndsAt: null,
      matchStartedAt: null,
      prizePool: get().stakeSol * 2,
      transportStatus: mode === 'bot' ? 'ready' : 'connected',
      result: { winnerId: null, reason: null },
      latestStakeLabel: null,
      projectiles: [],
      effects: [],
      notes: [
        mode === 'bot'
          ? 'Training drone online. Lock stake and enter the arena.'
          : `Room ${roomCode} created. Waiting for second pilot.`,
      ],
      pilots: {
        [localPilotId]: makePilot(localPilotId, {
          isLocal: true,
          isBot: false,
          wallet: localWallet,
          label: localLabel,
        }),
        [remotePilotId]: makePilot(remotePilotId, {
          isLocal: false,
          isBot: mode === 'bot',
          wallet: null,
        }),
      } as Record<PilotId, PilotState>,
    })
  },
  resetMatch: () => set(initialState),
  setTransportStatus: (status) => set({ transportStatus: status }),
  setMagicBlockLabel: (label) => set({ magicblockLabel: label }),
  setWallet: (pilotId, wallet) =>
    set((state) => ({
      pilots: {
        ...state.pilots,
        [pilotId]: {
          ...state.pilots[pilotId],
          wallet,
        },
      },
    })),
  setPilotLabel: (pilotId, label) =>
    set((state) => ({
      pilots: {
        ...state.pilots,
        [pilotId]: {
          ...state.pilots[pilotId],
          label: label.trim() || PILOT_META[pilotId].label,
        },
      },
    })),
  setStakeAmount: (value) =>
    set({
      stakeSol: value,
      prizePool: value * 2,
    }),
  confirmStake: (pilotId, txLabel) =>
    set((state) => {
      const pilots = {
        ...state.pilots,
        [pilotId]: {
          ...state.pilots[pilotId],
          stakeConfirmed: true,
        },
      }

      return {
        stage: pilots.blue.stakeConfirmed && pilots.violet.stakeConfirmed ? 'staking' : state.stage,
        pilots,
        latestStakeLabel: txLabel ?? state.latestStakeLabel,
        notes: [
          `${pilots[pilotId].label} locked ${state.stakeSol.toFixed(2)} SOL.`,
          ...state.notes.slice(0, 2),
        ],
      }
    }),
  startCountdown: (startsAt) =>
    set({
      stage: 'countdown',
      countdownEndsAt: startsAt,
      countdownValue: Math.max(
        1,
        Math.ceil((startsAt - performance.now()) / 1000),
      ),
      notes: ['Countdown initiated. Engines are warming up.'],
    }),
  startBattle: () =>
    set({
      stage: 'battle',
      matchStartedAt: performance.now(),
      countdownEndsAt: null,
      countdownValue: 0,
      timerLeft: MATCH_DURATION_SECONDS,
      notes: ['Combat live. Enemy in sight.'],
    }),
  endMatch: (winnerId, reason) =>
    set((state) => ({
      stage: 'finished',
      result: { winnerId, reason },
      notes: [
        `${state.pilots[winnerId].label} secured ${state.prizePool.toFixed(2)} SOL.`,
      ],
      effects: [
        ...state.effects,
        {
          id: `burst-${performance.now()}`,
          kind: 'burst',
          position: [...state.pilots[winnerId === 'blue' ? 'violet' : 'blue'].position],
          age: 0,
          maxAge: 1.5,
          color: PILOT_META[winnerId].accent,
        },
      ],
    })),
  disconnectPilot: (pilotId) =>
    set((state) => ({
      pilots: {
        ...state.pilots,
        [pilotId]: {
          ...state.pilots[pilotId],
          connected: false,
        },
      },
      notes: [`${state.pilots[pilotId].label} disconnected from the arena.`],
    })),
  syncPilotSnapshot: (payload) =>
    set((state) => ({
      pilots: {
        ...state.pilots,
        [payload.pilotId]: {
          ...state.pilots[payload.pilotId],
          connected: payload.connected,
          health: payload.health,
          shield: payload.shield,
          boost: payload.boost,
          velocity: payload.velocity,
          targetPosition: payload.position,
          targetRotation: payload.rotation,
        },
      },
    })),
  applyDamage: (targetId, amount, position, reason = 'hp') =>
    set((state) => {
      const target = state.pilots[targetId]
      const nextShield = Math.max(0, target.shield - amount)
      const overflow = Math.max(0, amount - target.shield)
      const nextHealth = Math.max(0, target.health - overflow)

      return {
        pilots: {
          ...state.pilots,
          [targetId]: {
            ...target,
            shield: nextShield,
            health: nextHealth,
          },
        },
        effects: [
          ...state.effects,
          {
            id: `impact-${performance.now()}`,
            kind: 'impact',
            position,
            age: 0,
            maxAge: 0.45,
            color: targetId === 'blue' ? PILOT_META.blue.accent : PILOT_META.violet.accent,
          },
        ],
        result:
          nextHealth <= 0
            ? {
                winnerId: targetId === 'blue' ? 'violet' : 'blue',
                reason,
              }
            : state.result,
      }
    }),
  setPilotTransform: (pilotId, patch) =>
    set((state) => ({
      pilots: {
        ...state.pilots,
        [pilotId]: {
          ...state.pilots[pilotId],
          ...patch,
        },
      },
    })),
  setProjectiles: (projectiles) => set({ projectiles }),
  pushProjectile: (projectile) =>
    set((state) => ({ projectiles: [...state.projectiles, projectile] })),
  setEffects: (effects) => set({ effects }),
  pushEffect: (effect) => set((state) => ({ effects: [...state.effects, effect] })),
  setTimerLeft: (seconds) => set({ timerLeft: seconds }),
  setLastSnapshotSentAt: (timestamp) => set({ lastSnapshotSentAt: timestamp }),
  addNote: (note) => set((state) => ({ notes: [note, ...state.notes.slice(0, 2)] })),
}))
