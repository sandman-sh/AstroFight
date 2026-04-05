import type { WalletContextState } from '@solana/wallet-adapter-react'
import { Buffer } from 'buffer'
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import type { PilotId } from '../game/types'
import env from '../config/env'

const ROOM_SEED_PREFIX = 'match'
const INITIALIZE_MATCH_DISCRIMINATOR = Uint8Array.from([156, 133, 52, 179, 176, 29, 64, 124])
const JOIN_MATCH_DISCRIMINATOR = Uint8Array.from([244, 8, 47, 130, 192, 59, 179, 44])

export interface EscrowStatus {
  liveEscrowReady: boolean
  liveSettlementReady: boolean
  programId: string | null
  arbiter: string | null
  note: string
}

export interface StakeApprovalOptions {
  connection: Connection
  sendTransaction: WalletContextState['sendTransaction']
  walletPublicKey: PublicKey
  roomCode: string
  stakeSol: number
  localPilotId: PilotId
  creatorWallet: string | null
}

export interface StakeApprovalResult {
  txLabel: string
  simulated: false
  escrowAddress: string
  creatorWallet: string
  role: 'creator' | 'opponent'
}

function requireEscrowProgramId() {
  if (!env.escrowProgramId) {
    throw new Error('Set VITE_ESCROW_PROGRAM_ID to your deployed devnet escrow program.')
  }

  return new PublicKey(env.escrowProgramId)
}

function getConfiguredArbiterPublicKey() {
  if (env.matchArbiter) {
    return new PublicKey(env.matchArbiter)
  }
  return null
}

function normalizeRoomCode(roomCode: string) {
  const normalized = roomCode.trim().toUpperCase()

  if (!normalized) {
    throw new Error('Room code is missing.')
  }

  if (encodeUtf8(normalized).length > 16) {
    throw new Error('Room code must be 16 characters or fewer for the escrow PDA.')
  }

  return normalized
}

function encodeUtf8(value: string) {
  return new TextEncoder().encode(value)
}

function encodeString(value: string) {
  const data = encodeUtf8(value)
  const length = Buffer.alloc(4)
  length.writeUInt32LE(data.length, 0)
  return Buffer.concat([length, Buffer.from(data)])
}

function encodeU64(value: number) {
  const encoded = Buffer.alloc(8)

  let remaining = BigInt(value)
  for (let index = 0; index < 8; index += 1) {
    encoded[index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }

  return encoded
}

function getStakeLamports(stakeSol: number) {
  const lamports = Math.round(stakeSol * LAMPORTS_PER_SOL)

  if (lamports <= 0) {
    throw new Error('Stake must be greater than zero.')
  }

  return lamports
}

function buildInitializeMatchInstruction(options: {
  creator: PublicKey
  arbiter: PublicKey
  escrowAddress: PublicKey
  roomCode: string
  stakeLamports: number
  programId: PublicKey
}) {
  const data = Buffer.concat([
    Buffer.from(INITIALIZE_MATCH_DISCRIMINATOR),
    encodeString(options.roomCode),
    encodeU64(options.stakeLamports),
  ])

  return new TransactionInstruction({
    programId: options.programId,
    keys: [
      { pubkey: options.creator, isSigner: true, isWritable: true },
      { pubkey: options.arbiter, isSigner: false, isWritable: false },
      { pubkey: options.escrowAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })
}

function buildJoinMatchInstruction(options: {
  opponent: PublicKey
  escrowAddress: PublicKey
  programId: PublicKey
}) {
  return new TransactionInstruction({
    programId: options.programId,
    keys: [
      { pubkey: options.opponent, isSigner: true, isWritable: true },
      { pubkey: options.escrowAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(JOIN_MATCH_DISCRIMINATOR),
  })
}

export function deriveMatchEscrowAddress(creatorWallet: string, roomCode: string) {
  const programId = requireEscrowProgramId()
  const creator = new PublicKey(creatorWallet)
  const normalizedRoomCode = normalizeRoomCode(roomCode)

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(ROOM_SEED_PREFIX),
      creator.toBuffer(),
      Buffer.from(normalizedRoomCode),
    ],
    programId,
  )[0]
}

export function getEscrowStatus(): EscrowStatus {
  const arbiterPublicKey = getConfiguredArbiterPublicKey()
  const depositsReady = Boolean(env.escrowProgramId && arbiterPublicKey)
  const settlementReady = Boolean(
    env.escrowProgramId &&
      arbiterPublicKey &&
      env.matchStateProgramId,
  )

  if (settlementReady) {
    return {
      liveEscrowReady: true,
      liveSettlementReady: true,
      programId: env.escrowProgramId || null,
      arbiter: arbiterPublicKey?.toBase58() ?? null,
      note: 'Real devnet escrow is live. Deposits happen on-chain and payout can route through the secure match service.',
    }
  }

  if (depositsReady) {
    return {
      liveEscrowReady: true,
      liveSettlementReady: false,
      programId: env.escrowProgramId || null,
      arbiter: arbiterPublicKey?.toBase58() ?? null,
      note: 'Real devnet deposits are ready, but secure payout still needs the deployed match-state program.',
    }
  }

  return {
    liveEscrowReady: false,
    liveSettlementReady: false,
    programId: env.escrowProgramId || null,
    arbiter: arbiterPublicKey?.toBase58() ?? null,
    note: 'Escrow is not configured. Set VITE_ESCROW_PROGRAM_ID and VITE_MATCH_ARBITER for real devnet staking.',
  }
}

export async function requestStakeApproval({
  connection,
  sendTransaction,
  walletPublicKey,
  roomCode,
  stakeSol,
  localPilotId,
  creatorWallet,
}: StakeApprovalOptions): Promise<StakeApprovalResult> {
  const status = getEscrowStatus()

  if (!status.liveEscrowReady) {
    throw new Error(status.note)
  }

  const programId = requireEscrowProgramId()
  const arbiter = getConfiguredArbiterPublicKey()

  if (!arbiter) {
    throw new Error('VITE_MATCH_ARBITER must be configured for real devnet deposits.')
  }

  const normalizedRoomCode = normalizeRoomCode(roomCode)
  const stakeLamports = getStakeLamports(stakeSol)
  const creatorPublicKey =
    localPilotId === 'blue'
      ? walletPublicKey
      : creatorWallet
        ? new PublicKey(creatorWallet)
        : null

  if (!creatorPublicKey) {
    throw new Error('Host wallet is missing. Wait for the room host to sync before staking.')
  }

  const escrowAddress = deriveMatchEscrowAddress(
    creatorPublicKey.toBase58(),
    normalizedRoomCode,
  )

  const transaction = new Transaction()
  const accountInfo = await connection.getAccountInfo(escrowAddress, 'confirmed')

  if (localPilotId === 'blue') {
    if (accountInfo) {
      throw new Error('This room already has an escrow PDA. Create a fresh room code before staking again.')
    }

    transaction.add(
      buildInitializeMatchInstruction({
        creator: walletPublicKey,
        arbiter,
        escrowAddress,
        roomCode: normalizedRoomCode,
        stakeLamports,
        programId,
      }),
    )
  } else {
    if (!accountInfo) {
      throw new Error('The host must lock their stake first so the escrow account exists on devnet.')
    }

    transaction.add(
      buildJoinMatchInstruction({
        opponent: walletPublicKey,
        escrowAddress,
        programId,
      }),
    )
  }

  const signature = await sendTransaction(transaction, connection, {
    preflightCommitment: 'confirmed',
    maxRetries: 3,
  })

  await connection.confirmTransaction(signature, 'confirmed')

  return {
    txLabel: signature,
    simulated: false,
    escrowAddress: escrowAddress.toBase58(),
    creatorWallet: creatorPublicKey.toBase58(),
    role: localPilotId === 'blue' ? 'creator' : 'opponent',
  }
}
