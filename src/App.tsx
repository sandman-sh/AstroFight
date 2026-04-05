import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { GameViewport } from './components/GameViewport'
import { createRoomCode, PILOT_META } from './config/game'
import { markDisconnectWin, receiveRemoteProjectile, triggerCountdown } from './game/engine'
import { useGameStore } from './game/store'
import type { PilotId } from './game/types'
import { probeMagicBlock } from './network/magicblock'
import type { MatchTransport, TransportEvent } from './network/types'
import { createWebrtcTransport } from './network/webrtcTransport'
import {
  fetchEscrowAccountState,
  getEscrowStatus,
  requestStakeApproval,
} from './solana/escrow'
import { finalizeMatch, prepareMatchState } from './solana/matchService'

function syncPilotPresence(
  pilotId: PilotId,
  connected: boolean,
  wallet?: string | null,
) {
  useGameStore.setState((state) => ({
    pilots: {
      ...state.pilots,
      [pilotId]: {
        ...state.pilots[pilotId],
        connected,
        wallet: wallet ?? state.pilots[pilotId].wallet,
      },
    },
  }))
}

export default function App() {
  const { connection } = useConnection()
  const {
    connected: walletConnected,
    publicKey,
    sendTransaction,
  } = useWallet()

  const transportRef = useRef<MatchTransport | null>(null)
  const inviteResetTimeoutRef = useRef<number | null>(null)
  const pendingInviteRoomRef = useRef<string | null>(null)
  const pendingInviteCreatorWalletRef = useRef<string | null>(null)
  const settlementAttemptRef = useRef<string | null>(null)
  const matchPrepareAttemptRef = useRef<string | null>(null)

  const [roomInput, setRoomInput] = useState('')
  const [stakePending, setStakePending] = useState(false)
  const [startPending, setStartPending] = useState(false)
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null)
  const [preferredPilotName, setPreferredPilotName] = useState('')

  const localPilotId = useGameStore((state) => state.localPilotId)
  const roomCode = useGameStore((state) => state.roomCode)
  const mode = useGameStore((state) => state.mode)
  const stage = useGameStore((state) => state.stage)
  const winnerId = useGameStore((state) => state.result.winnerId)
  const endReason = useGameStore((state) => state.result.reason)
  const hostWallet = useGameStore((state) => state.pilots.blue.wallet)

  const walletAddress = useMemo(
    () => publicKey?.toBase58() ?? null,
    [publicKey],
  )

  const resolvedPilotName = useMemo(() => {
    const trimmed = preferredPilotName.trim()
    return trimmed || PILOT_META[localPilotId].label
  }, [localPilotId, preferredPilotName])

  const inviteLink = useMemo(() => {
    if (!roomCode || mode !== 'broadcast' || typeof window === 'undefined') {
      return null
    }

    const url = new URL(window.location.href)
    url.searchParams.set('room', roomCode)
    if (hostWallet) {
      url.searchParams.set('host', hostWallet)
    }
    return url.toString()
  }, [hostWallet, mode, roomCode])

  const showInviteFeedback = useCallback((message: string) => {
    setInviteFeedback(message)

    if (inviteResetTimeoutRef.current) {
      window.clearTimeout(inviteResetTimeoutRef.current)
    }

    inviteResetTimeoutRef.current = window.setTimeout(() => {
      setInviteFeedback(null)
    }, 2200)
  }, [])

  const syncBrowserRoomParam = useCallback((nextRoomCode: string | null) => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)

    if (nextRoomCode) {
      url.searchParams.set('room', nextRoomCode)
    } else {
      url.searchParams.delete('room')
    }

    window.history.replaceState({}, '', url)
  }, [])

  const refreshMagicBlockStatus = useCallback(async (nextRoomCode?: string) => {
    const result = await probeMagicBlock(nextRoomCode)
    const endpointLabel = result.endpoint.replace(/^https?:\/\//, '')
    const validatorSuffix = result.validatorIdentity
      ? ` | ${result.validatorIdentity.slice(0, 8)}...`
      : ''
    const errorSuffix = result.error ? ` | ${result.error}` : ''

    useGameStore.getState().setMagicBlockLabel(
      `${result.note} Router ${endpointLabel}${validatorSuffix}${errorSuffix}`,
    )
  }, [])

  const clearTransport = useCallback(() => {
    const activeTransport = transportRef.current

    if (!activeTransport) return

    try {
      activeTransport.disconnect()
    } catch (error) {
      console.error('Failed to disconnect transport cleanly.', error)
    }

    transportRef.current = null
    useGameStore.getState().setTransportStatus('idle')
  }, [])

  const handleStartMatch = useCallback(
    async (transportOverride?: MatchTransport | null) => {
      let state = useGameStore.getState()

      if (
        state.mode !== 'broadcast' ||
        state.stage === 'countdown' ||
        state.stage === 'battle' ||
        state.stage === 'finished' ||
        !state.pilots.blue.isLocal
      ) {
        return
      }

      const creatorCandidate = state.pilots.blue.wallet

      if (creatorCandidate) {
        try {
          const escrowState = await fetchEscrowAccountState(
            connection,
            creatorCandidate,
            state.roomCode,
          )

          if (escrowState) {
            syncPilotPresence('blue', true, escrowState.creator)
            if (!state.pilots.blue.stakeConfirmed) {
              useGameStore.getState().confirmStake('blue')
            }

            if (escrowState.opponent) {
              syncPilotPresence('violet', true, escrowState.opponent)
              if (!state.pilots.violet.stakeConfirmed) {
                useGameStore.getState().confirmStake('violet')
              }
            }

            state = useGameStore.getState()
          }
        } catch (error) {
          console.error('Failed to refresh escrow state before launch.', error)
        }
      }

      if (!state.pilots.blue.stakeConfirmed || !state.pilots.violet.stakeConfirmed) {
        state.addNote('Both pilots must lock stake before launch.')
        return
      }

      const creatorWallet = state.pilots.blue.wallet
      const opponentWallet = state.pilots.violet.wallet

      if (!creatorWallet || !opponentWallet) {
        state.addNote('Waiting for both wallet addresses before arming the match state.')
        return
      }

      const prepareKey = `${state.roomCode}:${creatorWallet}:${opponentWallet}:${state.stakeSol}`

      setStartPending(true)

      try {
        if (matchPrepareAttemptRef.current !== prepareKey) {
          matchPrepareAttemptRef.current = prepareKey
          const preparation = await prepareMatchState({
            roomCode: state.roomCode,
            creatorWallet,
            opponentWallet,
            stakeSol: state.stakeSol,
            startTimeMs: Date.now(),
          })

          if (preparation.initializeSignature) {
            state.addNote(
              `Match-state initialized on devnet. Tx ${preparation.initializeSignature.slice(0, 8)}...`,
            )
          }

          if (preparation.armSignature) {
            state.addNote(
              `Match-state armed on devnet. Tx ${preparation.armSignature.slice(0, 8)}...`,
            )
          }
        }

        state.addNote('Launch confirmed. Countdown is live.')
        triggerCountdown(transportOverride ?? transportRef.current)
      } catch (error) {
        matchPrepareAttemptRef.current = null
        state.addNote(
          error instanceof Error
            ? `Match-state prep failed: ${error.message}`
            : 'Match-state prep failed before countdown.',
        )
      } finally {
        setStartPending(false)
      }
    },
    [connection],
  )

  const handleTransportEvent = useCallback(
    (event: TransportEvent) => {
      const state = useGameStore.getState()

      switch (event.type) {
        case 'peer-joined': {
          if (event.pilotId === state.localPilotId) return

          syncPilotPresence(event.pilotId, true, event.wallet)
          if (event.label) {
            state.setPilotLabel(event.pilotId, event.label)
          }
          state.setTransportStatus('connected')
          state.addNote(`${state.pilots[event.pilotId].label} linked into the sector.`)

          if (state.pilots[state.localPilotId].stakeConfirmed) {
            transportRef.current?.send({
              type: 'stake-status',
              pilotId: state.localPilotId,
              confirmed: true,
              wallet: state.pilots[state.localPilotId].wallet,
              label: state.pilots[state.localPilotId].label,
            })
          }
          return
        }

        case 'peer-left': {
          if (event.pilotId === state.localPilotId) return

          syncPilotPresence(event.pilotId, false)
          state.setTransportStatus('disconnected')
          state.disconnectPilot(event.pilotId)

          if (state.stage === 'battle') {
            markDisconnectWin(event.pilotId, transportRef.current)
          } else {
            state.addNote('Opponent link dropped before the duel started.')
          }
          return
        }

        case 'stake-status': {
          if (event.pilotId === state.localPilotId) return

          syncPilotPresence(event.pilotId, true, event.wallet)
          if (event.label) {
            state.setPilotLabel(event.pilotId, event.label)
          }

          if (event.confirmed && !state.pilots[event.pilotId].stakeConfirmed) {
            state.confirmStake(event.pilotId)
          }

          return
        }

        case 'profile-update': {
          if (event.pilotId === state.localPilotId) return
          syncPilotPresence(event.pilotId, true, event.wallet)
          state.setPilotLabel(event.pilotId, event.label)
          return
        }

        case 'countdown': {
          if (state.stage !== 'battle' && state.stage !== 'finished') {
            state.startCountdown(event.startsAt)
          }
          return
        }

        case 'snapshot': {
          if (event.payload.pilotId === state.localPilotId) return
          state.syncPilotSnapshot(event.payload)
          return
        }

        case 'shot': {
          if (event.projectile.ownerId === state.localPilotId) return
          receiveRemoteProjectile(event.projectile)
          return
        }

        case 'damage': {
          if (event.targetId !== state.localPilotId) return
          state.applyDamage(event.targetId, event.amount, event.position)
          return
        }

        case 'match-end': {
          if (state.stage !== 'finished') {
            state.endMatch(event.winnerId, event.reason)
          }
          return
        }

        default: {
          const exhaustiveCheck: never = event
          return exhaustiveCheck
        }
      }
    },
    [],
  )

  const setupRealtimeMatch = useCallback(
      (nextPilotId: PilotId, nextRoomCode: string, knownCreatorWallet?: string | null) => {
        clearTransport()
        settlementAttemptRef.current = null
        matchPrepareAttemptRef.current = null

      const transport = createWebrtcTransport()
      transport.connect(nextRoomCode, nextPilotId, handleTransportEvent)
      transportRef.current = transport

      useGameStore.getState().setupMatch({
        roomCode: nextRoomCode,
        localPilotId: nextPilotId,
        mode: 'broadcast',
        localWallet: walletAddress,
        localLabel: resolvedPilotName,
      })
      useGameStore.getState().setTransportStatus(transport.status)

      if (nextPilotId === 'violet' && knownCreatorWallet) {
        useGameStore.getState().setWallet('blue', knownCreatorWallet)
      }

      setRoomInput(nextRoomCode)
      syncBrowserRoomParam(nextRoomCode)

      transport.send({
        type: 'peer-joined',
        pilotId: nextPilotId,
        wallet: walletAddress,
        label: resolvedPilotName,
      })

      useGameStore.getState().addNote(
        nextPilotId === 'blue'
          ? `Invite room ${nextRoomCode} is live. Share the room code or invite link with your rival pilot.`
          : `Joined invite room ${nextRoomCode}. Awaiting host sync.`,
      )

      void refreshMagicBlockStatus(nextRoomCode)
    },
    [
      clearTransport,
      handleTransportEvent,
      refreshMagicBlockStatus,
      syncBrowserRoomParam,
      walletAddress,
      resolvedPilotName,
    ],
  )

  const handleCreateRoom = useCallback(() => {
    if (!walletConnected) return
    setupRealtimeMatch('blue', createRoomCode())
  }, [setupRealtimeMatch, walletConnected])

  const handleJoinRoom = useCallback(() => {
    if (!walletConnected) return

    const cleanedRoomCode = roomInput.trim().toUpperCase()

    if (!cleanedRoomCode) {
      showInviteFeedback('Enter a room code first.')
      return
    }

    setupRealtimeMatch('violet', cleanedRoomCode)
  }, [roomInput, setupRealtimeMatch, showInviteFeedback, walletConnected])

  const handleLaunchDemo = useCallback(() => {
    clearTransport()
    settlementAttemptRef.current = null
    matchPrepareAttemptRef.current = null
    syncBrowserRoomParam(null)

    const nextRoomCode = createRoomCode()
    const state = useGameStore.getState()

    state.setupMatch({
      roomCode: nextRoomCode,
      localPilotId: 'blue',
      mode: 'bot',
      localWallet: walletAddress,
      localLabel: resolvedPilotName,
    })
    state.setTransportStatus('ready')
    state.confirmStake('blue')
    state.confirmStake('violet')
    state.addNote('Training drone armed. Countdown commencing.')

    setRoomInput(nextRoomCode)
    void refreshMagicBlockStatus(nextRoomCode)

    window.setTimeout(() => {
      triggerCountdown(null)
    }, 180)
  }, [clearTransport, refreshMagicBlockStatus, syncBrowserRoomParam, walletAddress, resolvedPilotName])

  const copyText = useCallback(async (value: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }, [])

  const handleCopyRoomCode = useCallback(async () => {
    const currentRoomCode = useGameStore.getState().roomCode

    if (!currentRoomCode) {
      showInviteFeedback('No room code available yet.')
      return
    }

    await copyText(currentRoomCode)
    showInviteFeedback('Room code copied.')
  }, [copyText, showInviteFeedback])

  const handleCopyInviteLink = useCallback(async () => {
    if (!inviteLink) {
      showInviteFeedback('Invite link is not ready yet.')
      return
    }

    await copyText(inviteLink)
    showInviteFeedback('Invite link copied.')
  }, [copyText, inviteLink, showInviteFeedback])

  const handleGoHome = useCallback(() => {
    clearTransport()
    settlementAttemptRef.current = null
    matchPrepareAttemptRef.current = null
    pendingInviteRoomRef.current = null
    pendingInviteCreatorWalletRef.current = null
    syncBrowserRoomParam(null)
    setRoomInput('')
    setStakePending(false)
    setStartPending(false)
    setInviteFeedback(null)
    useGameStore.getState().resetMatch()
    void refreshMagicBlockStatus()
  }, [clearTransport, refreshMagicBlockStatus, syncBrowserRoomParam])

  const handleStakeReady = useCallback(async () => {
    const state = useGameStore.getState()

    if (!walletConnected || stakePending || !state.roomCode) return

    const currentPilot = state.pilots[state.localPilotId]
    if (currentPilot.stakeConfirmed) return

    if (!publicKey || !walletAddress) {
      state.addNote('Wallet signer is not ready yet. Reconnect Phantom and try again.')
      return
    }

    setStakePending(true)

    try {
      const creatorWallet =
        state.localPilotId === 'blue' ? walletAddress : state.pilots.blue.wallet
      const approval = await requestStakeApproval({
        connection,
        sendTransaction,
        walletPublicKey: publicKey,
        roomCode: state.roomCode,
        stakeSol: state.stakeSol,
        localPilotId: state.localPilotId,
        creatorWallet,
      })
      const escrowStatus = getEscrowStatus()
      const latestState = useGameStore.getState()
      const shortEscrow = `${approval.escrowAddress.slice(0, 4)}...${approval.escrowAddress.slice(-4)}`

      latestState.confirmStake(latestState.localPilotId, approval.txLabel)
      latestState.addNote(
        approval.role === 'creator'
          ? `Stake deposited on devnet. Escrow ${shortEscrow} is armed.`
          : `Stake matched on devnet. Joined escrow ${shortEscrow}.`,
      )
      latestState.addNote(escrowStatus.note)

      transportRef.current?.send({
        type: 'stake-status',
        pilotId: latestState.localPilotId,
        confirmed: true,
        wallet: latestState.pilots[latestState.localPilotId].wallet,
        label: latestState.pilots[latestState.localPilotId].label,
      })

      const updatedState = useGameStore.getState()
      if (
        updatedState.mode === 'broadcast' &&
        updatedState.pilots.blue.isLocal &&
        updatedState.pilots.blue.stakeConfirmed &&
        updatedState.pilots.violet.stakeConfirmed
      ) {
        updatedState.addNote('Both stakes confirmed. Start the duel when ready.')
      } else if (
        updatedState.mode === 'broadcast' &&
        updatedState.pilots[updatedState.localPilotId].stakeConfirmed
      ) {
        updatedState.addNote('Stake locked. Waiting for the opposing pilot.')
      }
    } catch (error) {
      console.error('Stake approval failed.', error)
      useGameStore.getState().addNote(
        error instanceof Error
          ? error.message
          : 'Stake approval failed. Retry the arm sequence.',
      )
    } finally {
      setStakePending(false)
    }
  }, [
    connection,
    publicKey,
    sendTransaction,
    stakePending,
    walletAddress,
    walletConnected,
  ])

  const handleStartDuel = useCallback(() => {
    void handleStartMatch()
  }, [handleStartMatch])

  const handlePilotNameChange = useCallback((value: string) => {
    setPreferredPilotName(value)

    const normalized = value.trim() || PILOT_META[localPilotId].label
    useGameStore.getState().setPilotLabel(localPilotId, normalized)

    if (typeof window !== 'undefined') {
      if (value.trim()) {
        window.localStorage.setItem('astrofight-player-name', value.trim())
      } else {
        window.localStorage.removeItem('astrofight-player-name')
      }
    }

    const state = useGameStore.getState()
    if (state.roomCode && state.mode === 'broadcast' && transportRef.current) {
      transportRef.current.send({
        type: 'profile-update',
        pilotId: state.localPilotId,
        label: normalized,
        wallet: state.pilots[state.localPilotId].wallet,
      })
    }
  }, [localPilotId])

  const handleRematch = useCallback(() => {
    const state = useGameStore.getState()

    if (state.mode === 'bot') {
      handleLaunchDemo()
      return
    }

    setupRealtimeMatch(state.localPilotId, createRoomCode())
  }, [handleLaunchDemo, setupRealtimeMatch])

  useEffect(() => {
    useGameStore.getState().setWallet(localPilotId, walletAddress)
  }, [localPilotId, walletAddress])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const storedName = window.localStorage.getItem('astrofight-player-name')
    if (!storedName) return

    setPreferredPilotName(storedName)
  }, [])

  useEffect(() => {
    useGameStore
      .getState()
      .setPilotLabel(localPilotId, resolvedPilotName)
  }, [localPilotId, resolvedPilotName])

  useEffect(() => {
    void refreshMagicBlockStatus()
  }, [refreshMagicBlockStatus])

  useEffect(() => {
    if (stage !== 'finished' || mode !== 'broadcast' || !roomCode || !winnerId) {
      return
    }

    const state = useGameStore.getState()
    const creatorWallet = state.pilots.blue.wallet
    const winnerWallet = state.pilots[winnerId].wallet

    if (!creatorWallet || !winnerWallet) {
      return
    }

    const settlementKey = `${roomCode}:${winnerId}:${endReason ?? 'hp'}`

    if (settlementAttemptRef.current === settlementKey) {
      return
    }

    settlementAttemptRef.current = settlementKey

    const escrowStatus = getEscrowStatus()

    if (!escrowStatus.liveSettlementReady) {
      state.addNote(
        'Winner decided. Server-side payout is not ready until the secure match service is configured.',
      )
      return
    }

    void finalizeMatch({
      roomCode,
      creatorWallet,
      winnerWallet,
      reason: endReason ?? 'hp',
    })
      .then(({ finishSignature, settleSignature, alreadySettled }) => {
        if (alreadySettled) {
          useGameStore.getState().addNote('Escrow was already settled on-chain.')
          return
        }

        if (finishSignature) {
          useGameStore.getState().addNote(
            `Match finalized on-chain. Tx ${finishSignature.slice(0, 8)}... confirmed.`,
          )
        }

        if (!settleSignature) {
          useGameStore.getState().addNote('Server payout completed without a settlement signature payload.')
          return
        }

        useGameStore.getState().addNote(
          `Escrow settled on devnet. Payout tx ${settleSignature.slice(0, 8)}... confirmed.`,
        )
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : 'Server payout failed.'

        useGameStore
          .getState()
          .addNote(`Server payout failed: ${message}`)
      })
  }, [endReason, mode, roomCode, stage, winnerId])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const inviteRoom = window.location.search
      ? new URLSearchParams(window.location.search).get('room')
      : null
    const inviteCreatorWallet = window.location.search
      ? new URLSearchParams(window.location.search).get('host')
      : null

    if (!inviteRoom) return

    const normalizedRoom = inviteRoom.trim().toUpperCase()
    pendingInviteRoomRef.current = normalizedRoom
    pendingInviteCreatorWalletRef.current = inviteCreatorWallet?.trim() || null
    setRoomInput(normalizedRoom)
    showInviteFeedback(`Invite room ${normalizedRoom} loaded.`)
  }, [showInviteFeedback])

  useEffect(() => {
    const inviteRoom = pendingInviteRoomRef.current

    if (!walletConnected || !inviteRoom || useGameStore.getState().roomCode) {
      return
    }

    pendingInviteRoomRef.current = null
    setupRealtimeMatch('violet', inviteRoom, pendingInviteCreatorWalletRef.current)
    showInviteFeedback(`Joined invite room ${inviteRoom}.`)
  }, [setupRealtimeMatch, showInviteFeedback, walletConnected])

  useEffect(() => {
    if (mode !== 'broadcast' || !roomCode) {
      return
    }

    const syncFromEscrow = async () => {
      const state = useGameStore.getState()
      const creatorWallet =
        state.pilots.blue.wallet ??
        (state.localPilotId === 'blue' ? walletAddress : pendingInviteCreatorWalletRef.current)

      if (!creatorWallet) {
        return
      }

      try {
        const escrowState = await fetchEscrowAccountState(
          connection,
          creatorWallet,
          roomCode,
        )

        if (!escrowState) {
          return
        }

        syncPilotPresence('blue', true, escrowState.creator)
        if (!useGameStore.getState().pilots.blue.stakeConfirmed) {
          useGameStore.getState().confirmStake('blue')
        }

        if (escrowState.opponent) {
          syncPilotPresence('violet', true, escrowState.opponent)
          if (!useGameStore.getState().pilots.violet.stakeConfirmed) {
            useGameStore.getState().confirmStake('violet')
          }
        }
      } catch (error) {
        console.error('Failed to sync escrow state from chain.', error)
      }
    }

    void syncFromEscrow()
    const interval = window.setInterval(() => {
      void syncFromEscrow()
    }, 2500)

    return () => {
      window.clearInterval(interval)
    }
  }, [connection, mode, roomCode, walletAddress])

  useEffect(() => {
    return () => {
      if (inviteResetTimeoutRef.current) {
        window.clearTimeout(inviteResetTimeoutRef.current)
      }

      clearTransport()
    }
  }, [clearTransport])

  return (
    <GameViewport
      transport={transportRef.current}
      roomInput={roomInput}
      inviteLink={inviteLink}
      inviteFeedback={inviteFeedback}
      onRoomInputChange={setRoomInput}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onLaunchDemo={handleLaunchDemo}
      onCopyInviteLink={handleCopyInviteLink}
      onCopyRoomCode={handleCopyRoomCode}
      onGoHome={handleGoHome}
      onStakeReady={handleStakeReady}
      onStartMatch={handleStartDuel}
      onRematch={handleRematch}
      stakePending={stakePending}
      startPending={startPending}
      walletConnected={walletConnected}
      playerName={preferredPilotName}
      onPlayerNameChange={handlePilotNameChange}
    />
  )
}
