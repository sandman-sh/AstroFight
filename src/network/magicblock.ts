import {
  Connection,
  PublicKey,
  type BlockhashWithExpiryBlockHeight,
  type ConfirmOptions,
  Transaction,
} from '@solana/web3.js'
import env, { integrationStatus } from '../config/env'

const encoder = new TextEncoder()

export interface MagicBlockProbeResult {
  ok: boolean
  endpoint: string
  validatorIdentity?: string
  validatorFqdn?: string
  roomCode?: string
  delegatedAccount?: string
  ownerProgramId?: string
  isDelegated?: boolean
  mode: 'router-only' | 'program-ready' | 'delegated'
  note: string
  error?: string
}

export function getWritableAccounts(transaction: Transaction) {
  const writableAccounts = new Set<string>()

  if (transaction.feePayer) {
    writableAccounts.add(transaction.feePayer.toBase58())
  }

  for (const instruction of transaction.instructions) {
    for (const key of instruction.keys) {
      if (key.isWritable) {
        writableAccounts.add(key.pubkey.toBase58())
      }
    }
  }

  return Array.from(writableAccounts)
}

export class ConnectionMagicRouter extends Connection {
  async getClosestValidator() {
    const response = await fetch(this.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getIdentity',
        params: [],
      }),
    })

    const payload = (await response.json()) as {
      result?: { identity?: string; fqdn?: string }
    }

    if (!payload.result?.identity) {
      throw new Error('MagicBlock router returned an invalid validator identity payload.')
    }

    return payload.result
  }

  async getDelegationStatus(account: PublicKey | string) {
    const accountAddress =
      typeof account === 'string' ? account : account.toBase58()

    const response = await fetch(`${this.rpcEndpoint}/getDelegationStatus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getDelegationStatus',
        params: [accountAddress],
      }),
    })

    const payload = (await response.json()) as {
      result?: { isDelegated?: boolean }
    }

    return {
      isDelegated: Boolean(payload.result?.isDelegated),
    }
  }

  async getLatestBlockhashForTransaction(
    transaction: Transaction,
    options?: ConfirmOptions,
  ): Promise<BlockhashWithExpiryBlockHeight> {
    void options
    const writableAccounts = getWritableAccounts(transaction)
    const response = await fetch(this.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBlockhashForAccounts',
        params: [writableAccounts],
      }),
    })

    const payload = (await response.json()) as {
      result?: BlockhashWithExpiryBlockHeight
    }

    if (!payload.result) {
      throw new Error('MagicBlock router did not return a blockhash for the transaction.')
    }

    return payload.result
  }

  async prepareTransaction(transaction: Transaction, options?: ConfirmOptions) {
    const latestBlockhash = await this.getLatestBlockhashForTransaction(
      transaction,
      options,
    )

    transaction.recentBlockhash = latestBlockhash.blockhash
    transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight

    return transaction
  }
}

export function deriveMatchStateAccount(roomCode: string) {
  if (!env.matchStateProgramId) return null

  const programId = new PublicKey(env.matchStateProgramId)
  const [matchStateAccount] = PublicKey.findProgramAddressSync(
    [encoder.encode('match-state'), encoder.encode(roomCode)],
    programId,
  )

  return matchStateAccount
}

export async function probeMagicBlock(roomCode?: string): Promise<MagicBlockProbeResult> {
  try {
    const router = new ConnectionMagicRouter(env.magicblockRpcHttp, {
      commitment: 'confirmed',
      wsEndpoint: env.magicblockRpcWs,
    })
    const validator = await router.getClosestValidator()

    const baseResult: MagicBlockProbeResult = {
      ok: true,
      endpoint: env.magicblockRpcHttp,
      validatorIdentity: validator.identity,
      validatorFqdn: validator.fqdn,
      mode: 'router-only',
      note: integrationStatus.magicblockErReady
        ? 'MagicBlock router reachable. Match-state program is configured.'
        : 'MagicBlock router reachable, but match-state program id is missing.',
    }

    if (!roomCode || !env.matchStateProgramId) {
      return baseResult
    }

    const matchStateAccount = deriveMatchStateAccount(roomCode)

    if (!matchStateAccount) {
      return baseResult
    }

    const delegation = await router.getDelegationStatus(matchStateAccount)
    const isDelegated = Boolean(delegation.isDelegated)

    return {
      ...baseResult,
      roomCode,
      delegatedAccount: matchStateAccount.toBase58(),
      ownerProgramId: env.matchStateProgramId,
      isDelegated,
      mode: isDelegated ? 'delegated' : 'program-ready',
      note: isDelegated
        ? `MagicBlock ER live for room ${roomCode}. Match-state account is delegated.`
        : `MagicBlock router is ready for room ${roomCode}, but the match-state account is not delegated yet.`,
    }
  } catch (error) {
    return {
      ok: false,
      endpoint: env.magicblockRpcHttp,
      mode: integrationStatus.magicblockErReady ? 'program-ready' : 'router-only',
      note: 'MagicBlock router could not be reached from the client.',
      error: error instanceof Error ? error.message : 'Unable to reach router',
    }
  }
}

export async function createPreparedMagicRouterTransaction(transaction: Transaction) {
  const router = new ConnectionMagicRouter(env.magicblockRpcHttp, {
    commitment: 'confirmed',
    wsEndpoint: env.magicblockRpcWs,
  })

  return router.prepareTransaction(transaction)
}
