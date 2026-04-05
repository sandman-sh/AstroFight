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
  const rawBody = await response.text()
  const contentType = response.headers.get('content-type') ?? ''
  let payload: { error?: string } | null = null

  if (rawBody && contentType.includes('application/json')) {
    try {
      payload = JSON.parse(rawBody) as { error?: string }
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const plainText = rawBody
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    throw new Error(
      payload?.error ??
        (plainText ||
          `Match service request failed with status ${response.status}.`)
    )
  }

  if (payload) {
    return payload as T
  }

  if (!rawBody) {
    throw new Error('Match service returned an empty response.')
  }

  try {
    return JSON.parse(rawBody) as T
  } catch {
    throw new Error('Match service returned a non-JSON success payload.')
  }
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
