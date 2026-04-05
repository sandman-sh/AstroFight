const env = {
  solanaRpcHttp:
    import.meta.env.VITE_SOLANA_RPC_HTTP ?? 'https://api.devnet.solana.com',
  solanaCluster: import.meta.env.VITE_SOLANA_CLUSTER ?? 'devnet',
  magicblockRpcHttp:
    import.meta.env.VITE_MAGICBLOCK_RPC_HTTP ??
    'https://devnet-router.magicblock.app',
  magicblockRpcWs:
    import.meta.env.VITE_MAGICBLOCK_RPC_WS ??
    'wss://devnet-router.magicblock.app',
  matchStateProgramId: import.meta.env.VITE_MATCH_STATE_PROGRAM_ID ?? '',
  magicblockValidator: import.meta.env.VITE_MAGICBLOCK_VALIDATOR ?? '',
  magicblockCommitFrequencyMs: Number(
    import.meta.env.VITE_MAGICBLOCK_COMMIT_FREQUENCY_MS ?? 3000,
  ),
  escrowProgramId: import.meta.env.VITE_ESCROW_PROGRAM_ID ?? '',
  matchArbiter: import.meta.env.VITE_MATCH_ARBITER ?? '',
}

export const integrationStatus = {
  escrowDepositReady: Boolean(env.escrowProgramId && env.matchArbiter),
  escrowSettlementReady: Boolean(
    env.escrowProgramId &&
      env.matchArbiter &&
      env.matchStateProgramId,
  ),
  magicblockConfigured: Boolean(env.magicblockRpcHttp && env.magicblockRpcWs),
  magicblockErReady: Boolean(
    env.magicblockRpcHttp &&
      env.magicblockRpcWs &&
      env.matchStateProgramId,
  ),
}

export default env
