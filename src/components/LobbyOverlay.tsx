import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Crosshair,
  House,
  Link2,
  Radio,
  Rocket,
  Shield,
  User,
  Wallet,
} from 'lucide-react'
import { formatSol } from '../config/game'
import { useGameStore } from '../game/store'
import { cn } from '../lib/cn'

interface LobbyOverlayProps {
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

function formatWalletDisplay(wallet: string | null | undefined) {
  if (!wallet) return 'Not linked'
  if (wallet.length <= 12) return wallet
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`
}

function CommandButton({
  title,
  icon,
  onClick,
  disabled = false,
  tone = 'default',
}: {
  title: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'primary'
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'command-button w-full',
        tone === 'primary' && 'command-button-primary',
      )}
    >
      <span className="command-button__icon">{icon}</span>
      <span className="display-text text-[0.95rem] tracking-[0.12em] text-white">
        {title}
      </span>
    </button>
  )
}

function UtilityButton({
  label,
  icon,
  onClick,
  tone = 'default',
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  tone?: 'default' | 'primary'
}) {
  return (
    <button
      onClick={onClick}
      className={cn('utility-button', tone === 'primary' && 'utility-button-primary')}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function ReadyRow({
  label,
  value,
  active = false,
}: {
  label: string
  value: string
  active?: boolean
}) {
  return (
    <div className="status-row">
      <span className="tech-text text-sm text-slate-200/72">{label}</span>
      <span className={cn('display-text text-[0.72rem] tracking-[0.16em]', active ? 'text-cyan-200' : 'text-white/44')}>
        {value}
      </span>
    </div>
  )
}

function SectionCard({
  title,
  children,
  icon,
}: {
  title: string
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="sharp-panel p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        {icon ? <span className="text-cyan-200">{icon}</span> : null}
        <div className="hud-label">{title}</div>
      </div>
      {children}
    </div>
  )
}

function PilotCard({
  title,
  label,
  wallet,
  state,
}: {
  title: string
  label: string
  wallet: string
  state: string
}) {
  return (
    <div className="sharp-panel p-4 sm:p-5">
      <div className="hud-label mb-2">{title}</div>
      <div className="display-text text-xl text-white sm:text-2xl">{label}</div>
      <div className="mt-2 tech-text text-sm text-slate-300/68">{wallet}</div>
      <div className="mt-4 inline-flex rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.7rem] uppercase tracking-[0.2em] text-slate-300/72">
        {state}
      </div>
    </div>
  )
}

export function LobbyOverlay({
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
}: LobbyOverlayProps) {
  const stage = useGameStore((state) => state.stage)
  const mode = useGameStore((state) => state.mode)
  const roomCode = useGameStore((state) => state.roomCode)
  const stakeSol = useGameStore((state) => state.stakeSol)
  const prizePool = useGameStore((state) => state.prizePool)
  const notes = useGameStore((state) => state.notes)
  const result = useGameStore((state) => state.result)
  const localPilotId = useGameStore((state) => state.localPilotId)
  const magicblockLabel = useGameStore((state) => state.magicblockLabel)
  const pilots = useGameStore((state) => state.pilots)

  const remotePilotId = localPilotId === 'blue' ? 'violet' : 'blue'
  const localPilot = pilots[localPilotId]
  const remotePilot = pilots[remotePilotId]
  const bothReady = localPilot.stakeConfirmed && remotePilot.stakeConfirmed
  const isBotMatch = mode === 'bot'
  const isHost = localPilotId === 'blue'

  if (stage === 'battle') {
    return null
  }

  const showConnectGate = !walletConnected && !roomCode
  const showModeSelect = walletConnected && !roomCode
  const isMatchSetup = Boolean(roomCode) && stage !== 'finished'
  const isFinished = stage === 'finished' && result.winnerId
  const trimmedName = playerName.trim()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${stage}-${walletConnected}-${roomCode || 'none'}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-30 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(10,16,28,0.22),rgba(2,4,10,0.78))] px-3 py-4 sm:px-5 sm:py-6"
      >
        <div className="w-full max-w-6xl rounded-[20px] border border-white/10 bg-slate-950/72 p-3 shadow-[0_28px_100px_rgba(0,0,0,0.52)] backdrop-blur-xl sm:p-5">
          {showConnectGate ? (
            <div className="mx-auto max-w-[540px] rounded-[16px] border border-white/10 bg-black/20 p-6 text-center sm:p-8">
              <div className="hud-label mb-3">Access</div>
              <h1 className="display-text text-4xl leading-none text-white sm:text-5xl">
                Connect wallet
              </h1>
              <p className="mx-auto mt-4 max-w-md tech-text text-sm leading-7 text-slate-300/72 sm:text-base">
                Link Phantom, set your pilot name, and queue directly into the duel deck.
              </p>
              <div className="mt-6 flex justify-center">
                <WalletMultiButton />
              </div>
            </div>
          ) : null}

          {showModeSelect ? (
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <SectionCard title="Command Deck" icon={<Rocket className="h-4 w-4" />}>
                <div className="space-y-4">
                  <div>
                    <label className="hud-label mb-2 block">Pilot Name</label>
                    <div className="field-shell">
                      <User className="h-4 w-4 text-cyan-200/80" />
                      <input
                        value={playerName}
                        onChange={(event) => onPlayerNameChange(event.target.value)}
                        placeholder={localPilot.label}
                        maxLength={18}
                        className="field-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="hud-label mb-2 block">Room Code</label>
                    <div className="field-shell">
                      <Radio className="h-4 w-4 text-cyan-200/80" />
                      <input
                        value={roomInput}
                        onChange={(event) => onRoomInputChange(event.target.value.toUpperCase())}
                        placeholder="ABCD"
                        maxLength={8}
                        className="field-input uppercase tracking-[0.28em]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <CommandButton
                      title="Create Room"
                      icon={<Rocket className="h-4 w-4" />}
                      onClick={onCreateRoom}
                      tone="primary"
                    />
                    <CommandButton
                      title="Join Room"
                      icon={<ArrowRight className="h-4 w-4" />}
                      onClick={onJoinRoom}
                      disabled={!roomInput.trim()}
                    />
                    <CommandButton
                      title="Training"
                      icon={<Crosshair className="h-4 w-4" />}
                      onClick={onLaunchDemo}
                    />
                  </div>

                  <div className="rounded-[12px] border border-white/10 bg-white/[0.03] p-3">
                    <div className="hud-label mb-2">Wallet</div>
                    <div className="tech-text text-sm text-slate-200/78">
                      {formatWalletDisplay(localPilot.wallet)}
                    </div>
                    <div className="mt-3">
                      <WalletMultiButton />
                    </div>
                  </div>
                </div>
              </SectionCard>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <SectionCard title="Pilot" icon={<User className="h-4 w-4" />}>
                  <div className="display-text text-2xl text-white">
                    {trimmedName || localPilot.label}
                  </div>
                  <div className="mt-2 tech-text text-sm text-slate-300/68">
                    {formatWalletDisplay(localPilot.wallet)}
                  </div>
                </SectionCard>

                <SectionCard title="Match" icon={<Shield className="h-4 w-4" />}>
                  <div className="space-y-2">
                    <div className="status-chip">Stake {formatSol(stakeSol)}</div>
                    <div className="status-chip">Prize {formatSol(prizePool)}</div>
                    <div className="status-chip">Mode 1v1 Duel</div>
                  </div>
                </SectionCard>

                <SectionCard title="Network" icon={<Radio className="h-4 w-4" />}>
                  <div className="tech-text text-sm leading-7 text-slate-300/72">
                    {magicblockLabel}
                  </div>
                </SectionCard>

                <div className="sm:col-span-2 xl:col-span-3">
                  <SectionCard title="Controls" icon={<Crosshair className="h-4 w-4" />}>
                    <div className="grid gap-2 text-sm text-slate-300/72 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="status-chip">W / S forward back</div>
                      <div className="status-chip">A / D strafe</div>
                      <div className="status-chip">Mouse aim</div>
                      <div className="status-chip">Space / Click fire</div>
                    </div>
                  </SectionCard>
                </div>
              </div>
            </div>
          ) : null}

          {isMatchSetup ? (
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <SectionCard title="Launch Panel" icon={<Rocket className="h-4 w-4" />}>
                <div className="space-y-4">
                  <div>
                    <label className="hud-label mb-2 block">Pilot Name</label>
                    <div className="field-shell">
                      <User className="h-4 w-4 text-cyan-200/80" />
                      <input
                        value={playerName}
                        onChange={(event) => onPlayerNameChange(event.target.value)}
                        placeholder={localPilot.label}
                        maxLength={18}
                        className="field-input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div className="status-chip">Room {roomCode}</div>
                    <div className="status-chip">Stake {formatSol(stakeSol)}</div>
                    <div className="status-chip">Prize {formatSol(prizePool)}</div>
                  </div>

                  {!isBotMatch && stage !== 'countdown' ? (
                    <div className="space-y-2">
                      <button
                        onClick={onStakeReady}
                        disabled={stakePending || localPilot.stakeConfirmed}
                        className="action-button w-full"
                      >
                        {stakePending
                          ? 'Locking Stake'
                          : localPilot.stakeConfirmed
                            ? 'Stake Locked'
                            : 'Lock Stake'}
                      </button>
                      <button
                        onClick={onStartMatch}
                        disabled={!bothReady || !isHost || startPending}
                        className="action-button w-full"
                      >
                        {startPending
                          ? 'Starting Duel'
                          : !bothReady
                            ? 'Waiting For Ready'
                            : isHost
                              ? 'Start Duel'
                              : 'Waiting For Host'}
                      </button>
                    </div>
                  ) : (
                    <div className="status-action-surface text-center">
                      <div className="hud-label mb-2">State</div>
                      <div className="display-text text-2xl text-white">
                        {stage === 'countdown' ? 'Launching' : 'Arming'}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {!isBotMatch ? (
                      <>
                        <UtilityButton
                          label="Copy Invite"
                          icon={<Link2 className="h-4 w-4" />}
                          onClick={onCopyInviteLink}
                          tone="primary"
                        />
                        <UtilityButton
                          label="Copy Code"
                          icon={<Copy className="h-4 w-4" />}
                          onClick={onCopyRoomCode}
                        />
                      </>
                    ) : null}
                    <UtilityButton
                      label="Home"
                      icon={<House className="h-4 w-4" />}
                      onClick={onGoHome}
                    />
                    {inviteFeedback ? (
                      <div className="inline-flex w-full items-center gap-2 rounded-[10px] border border-emerald-300/16 bg-emerald-300/[0.08] px-3 py-2 text-[0.72rem] uppercase tracking-[0.16em] text-emerald-100">
                        <CheckCircle2 className="h-4 w-4" />
                        {inviteFeedback}
                      </div>
                    ) : null}
                  </div>
                </div>
              </SectionCard>

              <div className="grid gap-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <PilotCard
                    title="You"
                    label={localPilot.label}
                    wallet={formatWalletDisplay(localPilot.wallet)}
                    state={localPilot.stakeConfirmed ? 'Locked' : 'Readying'}
                  />
                  <PilotCard
                    title="Opponent"
                    label={remotePilot.isBot ? 'Training Drone' : remotePilot.label}
                    wallet={remotePilot.isBot ? 'Simulation' : formatWalletDisplay(remotePilot.wallet)}
                    state={remotePilot.connected || remotePilot.isBot ? 'Online' : 'Waiting'}
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
                  <SectionCard title="Ready Check" icon={<Shield className="h-4 w-4" />}>
                    <div className="space-y-2">
                      <ReadyRow
                        label="Wallet"
                        value={walletConnected ? 'OK' : 'WAIT'}
                        active={walletConnected}
                      />
                      <ReadyRow
                        label="Stake"
                        value={localPilot.stakeConfirmed ? 'OK' : 'WAIT'}
                        active={localPilot.stakeConfirmed}
                      />
                      <ReadyRow
                        label="Opponent"
                        value={remotePilot.connected || remotePilot.isBot ? 'OK' : 'WAIT'}
                        active={remotePilot.connected || remotePilot.isBot}
                      />
                      <ReadyRow
                        label="Launch"
                        value={
                          bothReady
                            ? isHost
                              ? 'HOST READY'
                              : 'HOST START'
                            : 'WAIT'
                        }
                        active={bothReady}
                      />
                    </div>
                  </SectionCard>

                  <SectionCard title="Status Feed" icon={<Wallet className="h-4 w-4" />}>
                    <div className="space-y-2">
                      {inviteLink && !isBotMatch ? (
                        <div className="status-chip tech-text truncate text-left normal-case tracking-normal text-slate-300/74">
                          {inviteLink}
                        </div>
                      ) : null}
                      <div className="status-chip tech-text text-left normal-case tracking-normal text-slate-300/74">
                        {magicblockLabel}
                      </div>
                      {bothReady && !isBotMatch ? (
                        <div className="rounded-[10px] border border-cyan-300/16 bg-cyan-300/[0.06] px-3 py-3 text-sm text-cyan-100/88">
                          {isHost
                            ? 'Both stakes are locked. Launch the duel when ready.'
                            : 'Both stakes are locked. Waiting for the host to launch the duel.'}
                        </div>
                      ) : null}
                      {notes.slice(0, 3).map((note, index) => (
                        <div
                          key={`${note}-${index}`}
                          className="rounded-[10px] border border-white/10 bg-black/20 px-3 py-3 text-sm text-slate-300/72"
                        >
                          {note}
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              </div>
            </div>
          ) : null}

          {isFinished ? (
            <div className="mx-auto max-w-[520px] rounded-[16px] border border-white/10 bg-black/20 p-6 text-center sm:p-8">
              <div className="hud-label mb-3">Result</div>
              <div className="display-text text-4xl text-white sm:text-5xl">
                {result.winnerId === localPilotId ? 'Victory' : 'Defeat'}
              </div>
              <p className="mt-4 tech-text text-sm leading-7 text-slate-300/72 sm:text-base">
                {result.winnerId === localPilotId
                  ? `Payout ${formatSol(prizePool)}`
                  : `${pilots[result.winnerId!].label} secured the duel.`}
              </p>
              <div className="mt-6 space-y-2">
                <button onClick={onRematch} className="action-button">
                  Queue Rematch
                </button>
                <button onClick={onGoHome} className="action-button w-full">
                  Home
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
