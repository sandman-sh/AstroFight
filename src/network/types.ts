import type {
  EndReason,
  PilotId,
  ProjectileState,
  SnapshotPayload,
} from '../game/types'

export type TransportStatus = 'idle' | 'ready' | 'connected' | 'disconnected'

export type TransportEvent =
  | {
      type: 'peer-joined'
      pilotId: PilotId
      wallet?: string | null
      label?: string | null
    }
  | {
      type: 'peer-left'
      pilotId: PilotId
    }
  | {
      type: 'stake-status'
      pilotId: PilotId
      confirmed: boolean
      wallet?: string | null
      label?: string | null
    }
  | {
      type: 'profile-update'
      pilotId: PilotId
      label: string
      wallet?: string | null
    }
  | {
      type: 'countdown'
      startsAt: number
    }
  | {
      type: 'snapshot'
      payload: SnapshotPayload
    }
  | {
      type: 'shot'
      projectile: ProjectileState
    }
  | {
      type: 'damage'
      targetId: PilotId
      amount: number
      position: [number, number, number]
      from: PilotId
    }
  | {
      type: 'match-end'
      winnerId: PilotId
      reason: EndReason
    }

export interface MatchTransport {
  kind: 'broadcast' | 'webrtc'
  status: TransportStatus
  connect: (
    roomCode: string,
    pilotId: PilotId,
    onEvent: (event: TransportEvent) => void,
  ) => void
  send: (event: TransportEvent) => void
  disconnect: () => void
}
