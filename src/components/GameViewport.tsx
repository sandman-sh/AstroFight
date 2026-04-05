import { AstroFightScene } from './scene/AstroFightScene'
import type { MatchTransport } from '../network/types'
import { useGameAudio } from '../hooks/useGameAudio'
import { useGameInput } from '../hooks/useGameInput'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useGameStore } from '../game/store'
import { HudOverlay } from './HudOverlay'
import { LobbyOverlay } from './LobbyOverlay'
import { MobileControls } from './MobileControls'

interface GameViewportProps {
  transport: MatchTransport | null
  roomInput: string
  inviteLink: string | null
  inviteFeedback: string | null
  playerName: string
  onRoomInputChange: (value: string) => void
  onPlayerNameChange: (value: string) => void
  onCreateRoom: () => void
  onJoinRoom: () => void
  onLaunchDemo: () => void
  onCopyInviteLink: () => void
  onCopyRoomCode: () => void
  onGoHome: () => void
  onStakeReady: () => void
  onStartMatch: () => void
  onRematch: () => void
  stakePending: boolean
  startPending: boolean
  walletConnected: boolean
}

export function GameViewport({
  transport,
  roomInput,
  inviteLink,
  inviteFeedback,
  playerName,
  onRoomInputChange,
  onPlayerNameChange,
  onCreateRoom,
  onJoinRoom,
  onLaunchDemo,
  onCopyInviteLink,
  onCopyRoomCode,
  onGoHome,
  onStakeReady,
  onStartMatch,
  onRematch,
  stakePending,
  startPending,
  walletConnected,
}: GameViewportProps) {
  const isTouch = useMediaQuery('(pointer: coarse)')
  const matchStage = useGameStore((state) => state.stage)
  const roomCode = useGameStore((state) => state.roomCode)
  useGameAudio()
  const {
    input,
    surfaceHandlers,
    setVirtualMove,
    setVirtualBoost,
    setVirtualFiring,
    nudgeAim,
  } = useGameInput()

  return (
    <div
      className="touch-none relative h-[100svh] w-full overflow-hidden"
      {...surfaceHandlers}
    >
      <div className="absolute inset-0 bg-nebula opacity-100" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_36%,rgba(0,0,0,0.42)_100%)]" />
      <div className="pointer-events-none absolute inset-0 z-[5]">
        <div className="absolute left-4 top-4 h-20 w-20 border-l border-t border-cyan-300/20 md:left-8 md:top-8 md:h-28 md:w-28" />
        <div className="absolute right-4 top-4 h-20 w-20 border-r border-t border-violet-300/20 md:right-8 md:top-8 md:h-28 md:w-28" />
        <div className="absolute bottom-4 left-4 h-20 w-20 border-b border-l border-cyan-300/20 md:bottom-8 md:left-8 md:h-28 md:w-28" />
        <div className="absolute bottom-4 right-4 h-20 w-20 border-b border-r border-violet-300/20 md:bottom-8 md:right-8 md:h-28 md:w-28" />
      </div>
      <AstroFightScene input={input} transport={transport} />
      {roomCode && (matchStage === 'countdown' || matchStage === 'battle') ? (
        <HudOverlay />
      ) : null}
      <LobbyOverlay
        roomInput={roomInput}
        inviteLink={inviteLink}
        inviteFeedback={inviteFeedback}
        playerName={playerName}
        onRoomInputChange={onRoomInputChange}
        onPlayerNameChange={onPlayerNameChange}
        onCreateRoom={onCreateRoom}
        onJoinRoom={onJoinRoom}
        onLaunchDemo={onLaunchDemo}
        onCopyInviteLink={onCopyInviteLink}
        onCopyRoomCode={onCopyRoomCode}
        onGoHome={onGoHome}
        onStakeReady={onStakeReady}
        onStartMatch={onStartMatch}
        onRematch={onRematch}
        stakePending={stakePending}
        startPending={startPending}
        walletConnected={walletConnected}
      />
      {isTouch ? (
        <MobileControls
          onMove={setVirtualMove}
          onBoost={setVirtualBoost}
          onFire={setVirtualFiring}
          onAimDelta={nudgeAim}
        />
      ) : null}
    </div>
  )
}
