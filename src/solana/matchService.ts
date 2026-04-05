import type { EndReason } from '../game/types'

export interface MatchPrepareOptions {
  roomCode: string
  creatorWallet: string
  opponentWallet: string
  stakeSol: number
  startTimeMs: number
}

export interface MatchFinalizeOptions {
  roomCode: string
  creatorWallet: string
  winnerWallet: string
  reason: EndReason
}

function normalizeRoomCode(roomCode: string) {
  return roomCode.trim().toUpperCase()
}

function mapReason(reason: EndReason) {
  if (reason === 'disconnect') return 'disconnect'
  if (reason === 'timeout') return 'timeout'
  return 'hp'
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as { error?: string }

  if (!response.ok) {
    throw new Error(payload.error ?? 'Match service request failed.')
  }

  return payload as T
}

export async function prepareMatchState(options: MatchPrepareOptions) {
  const response = await fetch('/api/match/prepare', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      roomCode: normalizeRoomCode(options.roomCode),
      creatorWallet: options.creatorWallet,
      opponentWallet: options.opponentWallet,
      stakeSol: options.stakeSol,
      startTimeMs: options.startTimeMs,
    }),
  })

  return parseResponse<{
    roomCode: string
    matchStateAddress: string
    initializeSignature: string | null
    armSignature: string | null
    stage: number | null
  }>(response)
}

export async function finalizeMatch(options: MatchFinalizeOptions) {
  const response = await fetch('/api/match/finalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      roomCode: normalizeRoomCode(options.roomCode),
      creatorWallet: options.creatorWallet,
      winnerWallet: options.winnerWallet,
      reason: mapReason(options.reason),
    }),
  })

  return parseResponse<{
    roomCode: string
    matchStateAddress: string
    escrowAddress: string
    finishSignature: string | null
    settleSignature: string | null
    alreadySettled: boolean
  }>(response)
}
