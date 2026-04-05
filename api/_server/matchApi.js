import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionInstruction, } from '@solana/web3.js';
const encoder = new TextEncoder();
const ROOM_SEED_PREFIX = 'match';
const MATCH_STATE_SEED_PREFIX = 'match-state';
const INITIALIZE_MATCH_STATE_DISCRIMINATOR = Uint8Array.from([64, 45, 172, 116, 28, 184, 229, 69]);
const ARM_MATCH_DISCRIMINATOR = Uint8Array.from([65, 91, 197, 24, 239, 18, 235, 41]);
const FINISH_MATCH_DISCRIMINATOR = Uint8Array.from([65, 193, 5, 71, 16, 64, 11, 186]);
const SETTLE_MATCH_DISCRIMINATOR = Uint8Array.from([71, 124, 117, 96, 191, 217, 116, 24]);
const MATCH_ESCROW_ACCOUNT_DISCRIMINATOR = accountDiscriminator('MatchEscrow');
const MATCH_STATE_ACCOUNT_DISCRIMINATOR = accountDiscriminator('MatchStateAccount');
class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function accountDiscriminator(name) {
    return createHash('sha256')
        .update(`account:${name}`)
        .digest()
        .subarray(0, 8);
}
function normalizeRoomCode(roomCode) {
    const normalized = roomCode.trim().toUpperCase();
    if (!normalized) {
        throw new HttpError(400, 'Room code is required.');
    }
    if (encoder.encode(normalized).length > 16) {
        throw new HttpError(400, 'Room code must be 16 characters or fewer.');
    }
    return normalized;
}
function parseSecretKey(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return Uint8Array.from(parsed.map((entry) => Number(entry)));
        }
    }
    catch {
        // Fall through to comma-separated parsing.
    }
    const commaSeparated = trimmed
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    if (!commaSeparated.length)
        return null;
    return Uint8Array.from(commaSeparated.map((entry) => Number(entry)));
}
function getServerEnv() {
    const solanaRpcHttp = process.env.VITE_SOLANA_RPC_HTTP ?? 'https://api.devnet.solana.com';
    const solanaCluster = process.env.VITE_SOLANA_CLUSTER ?? 'devnet';
    const escrowProgramId = process.env.VITE_ESCROW_PROGRAM_ID ?? '';
    const matchStateProgramId = process.env.VITE_MATCH_STATE_PROGRAM_ID ?? '';
    const matchArbiter = process.env.VITE_MATCH_ARBITER ?? '';
    const matchArbiterSecretKey = process.env.MATCH_ARBITER_SECRET_KEY ?? '';
    if (!escrowProgramId) {
        throw new HttpError(500, 'Server settlement is missing VITE_ESCROW_PROGRAM_ID.');
    }
    if (!matchStateProgramId) {
        throw new HttpError(500, 'Server settlement is missing VITE_MATCH_STATE_PROGRAM_ID.');
    }
    if (!matchArbiter) {
        throw new HttpError(500, 'Server settlement is missing VITE_MATCH_ARBITER.');
    }
    const parsedSecretKey = parseSecretKey(matchArbiterSecretKey);
    if (!parsedSecretKey?.length) {
        throw new HttpError(500, 'Server settlement is missing MATCH_ARBITER_SECRET_KEY.');
    }
    return {
        solanaRpcHttp,
        solanaCluster,
        escrowProgramId: new PublicKey(escrowProgramId),
        matchStateProgramId: new PublicKey(matchStateProgramId),
        matchArbiter: new PublicKey(matchArbiter),
        matchArbiterKeypair: Keypair.fromSecretKey(parsedSecretKey),
    };
}
function getConnection() {
    const env = getServerEnv();
    return new Connection(env.solanaRpcHttp, 'confirmed');
}
function encodeString(value) {
    const data = Buffer.from(encoder.encode(value));
    const length = Buffer.alloc(4);
    length.writeUInt32LE(data.length, 0);
    return Buffer.concat([length, data]);
}
function encodeU64(value) {
    const data = Buffer.alloc(8);
    data.writeBigUInt64LE(value, 0);
    return data;
}
function encodeI64(value) {
    const data = Buffer.alloc(8);
    data.writeBigInt64LE(value, 0);
    return data;
}
function encodeBool(value) {
    return Buffer.from([value ? 1 : 0]);
}
function decodeString(data, offset) {
    const length = data.readUInt32LE(offset);
    const start = offset + 4;
    const end = start + length;
    return {
        value: data.subarray(start, end).toString('utf8'),
        offset: end,
    };
}
function decodePubkey(data, offset) {
    return {
        value: new PublicKey(data.subarray(offset, offset + 32)),
        offset: offset + 32,
    };
}
function decodeU64(data, offset) {
    return {
        value: data.readBigUInt64LE(offset),
        offset: offset + 8,
    };
}
function decodeI64(data, offset) {
    return {
        value: data.readBigInt64LE(offset),
        offset: offset + 8,
    };
}
function assertDiscriminator(data, discriminator, label) {
    if (!data.subarray(0, 8).equals(discriminator)) {
        throw new HttpError(409, `${label} account discriminator mismatch.`);
    }
}
function deriveMatchEscrowAddress(creatorWallet, roomCode) {
    const env = getServerEnv();
    return PublicKey.findProgramAddressSync([
        Buffer.from(ROOM_SEED_PREFIX),
        new PublicKey(creatorWallet).toBuffer(),
        Buffer.from(roomCode),
    ], env.escrowProgramId)[0];
}
function deriveMatchStateAddress(roomCode) {
    const env = getServerEnv();
    return PublicKey.findProgramAddressSync([Buffer.from(MATCH_STATE_SEED_PREFIX), Buffer.from(roomCode)], env.matchStateProgramId)[0];
}
function parseMatchEscrowAccount(data) {
    assertDiscriminator(data, MATCH_ESCROW_ACCOUNT_DISCRIMINATOR, 'Escrow');
    let offset = 8;
    const creator = decodePubkey(data, offset);
    offset = creator.offset;
    const opponent = decodePubkey(data, offset);
    offset = opponent.offset;
    const winner = decodePubkey(data, offset);
    offset = winner.offset;
    const arbiter = decodePubkey(data, offset);
    offset = arbiter.offset;
    const roomCode = decodeString(data, offset);
    offset = roomCode.offset;
    const stakeLamports = decodeU64(data, offset);
    offset = stakeLamports.offset;
    const status = data.readUInt8(offset);
    offset += 1;
    const bump = data.readUInt8(offset);
    return {
        creator: creator.value,
        opponent: opponent.value,
        winner: winner.value,
        arbiter: arbiter.value,
        roomCode: roomCode.value,
        stakeLamports: stakeLamports.value,
        status,
        bump,
    };
}
function parseMatchStateAccount(data) {
    assertDiscriminator(data, MATCH_STATE_ACCOUNT_DISCRIMINATOR, 'Match state');
    let offset = 8;
    const roomCode = decodeString(data, offset);
    offset = roomCode.offset;
    const authority = decodePubkey(data, offset);
    offset = authority.offset;
    const playerOne = decodePubkey(data, offset);
    offset = playerOne.offset;
    const playerTwo = decodePubkey(data, offset);
    offset = playerTwo.offset;
    const winner = decodePubkey(data, offset);
    offset = winner.offset;
    const stakeLamports = decodeU64(data, offset);
    offset = stakeLamports.offset;
    const stage = data.readUInt8(offset);
    offset += 1;
    const endReason = data.readUInt8(offset);
    offset += 1;
    const matchStartedAtMs = decodeI64(data, offset);
    offset = matchStartedAtMs.offset;
    const updatedAtSlot = decodeU64(data, offset);
    return {
        roomCode: roomCode.value,
        authority: authority.value,
        playerOne: playerOne.value,
        playerTwo: playerTwo.value,
        winner: winner.value,
        stakeLamports: stakeLamports.value,
        stage,
        endReason,
        matchStartedAtMs: matchStartedAtMs.value,
        updatedAtSlot: updatedAtSlot.value,
    };
}
async function ensureFeeBalance(connection, arbiter) {
    const balance = await connection.getBalance(arbiter.publicKey, 'confirmed');
    const minimumLamports = 0.002 * 1_000_000_000;
    if (balance >= minimumLamports) {
        return;
    }
    throw new HttpError(503, `Server arbiter wallet ${arbiter.publicKey.toBase58()} is underfunded for match-state transactions. Fund it on devnet and retry.`);
}
async function sendServerTransaction(instructions) {
    const env = getServerEnv();
    const connection = getConnection();
    await ensureFeeBalance(connection, env.matchArbiterKeypair);
    const transaction = new Transaction();
    for (const instruction of instructions) {
        transaction.add(instruction);
    }
    return sendAndConfirmTransaction(connection, transaction, [env.matchArbiterKeypair], {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
    });
}
function buildInitializeMatchStateInstruction(options) {
    const env = getServerEnv();
    return new TransactionInstruction({
        programId: env.matchStateProgramId,
        keys: [
            { pubkey: options.payer, isSigner: true, isWritable: true },
            { pubkey: options.authority, isSigner: false, isWritable: false },
            { pubkey: options.matchStateAddress, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([
            Buffer.from(INITIALIZE_MATCH_STATE_DISCRIMINATOR),
            encodeString(options.roomCode),
            options.creatorWallet.toBuffer(),
            options.opponentWallet.toBuffer(),
            encodeU64(options.stakeLamports),
        ]),
    });
}
function buildArmMatchInstruction(options) {
    const env = getServerEnv();
    return new TransactionInstruction({
        programId: env.matchStateProgramId,
        keys: [
            { pubkey: options.authority, isSigner: true, isWritable: false },
            { pubkey: options.matchStateAddress, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([
            Buffer.from(ARM_MATCH_DISCRIMINATOR),
            encodeI64(options.startTimeMs),
        ]),
    });
}
function buildFinishMatchInstruction(options) {
    const env = getServerEnv();
    return new TransactionInstruction({
        programId: env.matchStateProgramId,
        keys: [
            { pubkey: options.authority, isSigner: true, isWritable: false },
            { pubkey: options.matchStateAddress, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([
            Buffer.from(FINISH_MATCH_DISCRIMINATOR),
            options.winner.toBuffer(),
            Buffer.from([options.reasonCode]),
        ]),
    });
}
function buildSettleMatchInstruction(options) {
    const env = getServerEnv();
    return new TransactionInstruction({
        programId: env.escrowProgramId,
        keys: [
            { pubkey: options.arbiter, isSigner: true, isWritable: true },
            { pubkey: options.escrowAddress, isSigner: false, isWritable: true },
            { pubkey: options.matchStateAddress, isSigner: false, isWritable: false },
            { pubkey: options.winner, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([
            Buffer.from(SETTLE_MATCH_DISCRIMINATOR),
            options.winner.toBuffer(),
            encodeBool(options.disconnectWin),
        ]),
    });
}
function mapReasonToCode(reason) {
    if (reason === 'disconnect')
        return 1;
    if (reason === 'timeout')
        return 2;
    return 0;
}
async function getParsedMatchState(roomCode) {
    const connection = getConnection();
    const matchStateAddress = deriveMatchStateAddress(roomCode);
    const accountInfo = await connection.getAccountInfo(matchStateAddress, 'confirmed');
    if (!accountInfo) {
        return {
            matchStateAddress,
            accountInfo: null,
            parsed: null,
        };
    }
    return {
        matchStateAddress,
        accountInfo,
        parsed: parseMatchStateAccount(Buffer.from(accountInfo.data)),
    };
}
async function getParsedEscrow(roomCode, creatorWallet) {
    const connection = getConnection();
    const escrowAddress = deriveMatchEscrowAddress(creatorWallet, roomCode);
    const accountInfo = await connection.getAccountInfo(escrowAddress, 'confirmed');
    if (!accountInfo) {
        throw new HttpError(404, 'Escrow PDA was not found for this room.');
    }
    return {
        escrowAddress,
        parsed: parseMatchEscrowAccount(Buffer.from(accountInfo.data)),
    };
}
export async function prepareMatchStateServer(body) {
    const env = getServerEnv();
    const roomCode = normalizeRoomCode(body.roomCode);
    const creatorWallet = new PublicKey(body.creatorWallet);
    const opponentWallet = new PublicKey(body.opponentWallet);
    const stakeLamports = BigInt(Math.round(body.stakeSol * LAMPORTS_PER_SOL));
    if (stakeLamports <= 0n) {
        throw new HttpError(400, 'Stake must be greater than zero.');
    }
    if (creatorWallet.equals(opponentWallet)) {
        throw new HttpError(400, 'Creator and opponent wallets must be different.');
    }
    const startTimeMs = BigInt(Math.round(body.startTimeMs));
    const { matchStateAddress, parsed } = await getParsedMatchState(roomCode);
    let initializeSignature = null;
    let armSignature = null;
    let currentState = parsed;
    if (!currentState) {
        initializeSignature = await sendServerTransaction([
            buildInitializeMatchStateInstruction({
                payer: env.matchArbiterKeypair.publicKey,
                authority: env.matchArbiterKeypair.publicKey,
                matchStateAddress,
                roomCode,
                creatorWallet,
                opponentWallet,
                stakeLamports,
            }),
        ]);
        currentState = (await getParsedMatchState(roomCode)).parsed;
    }
    if (!currentState) {
        throw new HttpError(500, 'Match-state account could not be loaded after initialization.');
    }
    if (currentState.playerOne.toBase58() !== creatorWallet.toBase58() ||
        currentState.playerTwo.toBase58() !== opponentWallet.toBase58()) {
        throw new HttpError(409, 'Match-state pilots do not match the current room wallets.');
    }
    if (currentState.stakeLamports !== stakeLamports) {
        throw new HttpError(409, 'Match-state stake does not match the current room stake.');
    }
    if (currentState.stage === 0) {
        armSignature = await sendServerTransaction([
            buildArmMatchInstruction({
                authority: env.matchArbiterKeypair.publicKey,
                matchStateAddress,
                startTimeMs,
            }),
        ]);
        currentState = (await getParsedMatchState(roomCode)).parsed;
    }
    return {
        roomCode,
        matchStateAddress: matchStateAddress.toBase58(),
        initializeSignature,
        armSignature,
        stage: currentState?.stage ?? null,
    };
}
export async function finalizeMatchServer(body) {
    const env = getServerEnv();
    const roomCode = normalizeRoomCode(body.roomCode);
    const winnerWallet = new PublicKey(body.winnerWallet);
    const reasonCode = mapReasonToCode(body.reason);
    const { escrowAddress, parsed: escrow } = await getParsedEscrow(roomCode, body.creatorWallet);
    const { matchStateAddress, parsed: matchState } = await getParsedMatchState(roomCode);
    if (!matchState) {
        throw new HttpError(409, 'Match-state PDA is missing for this room. Prepare the room before battle.');
    }
    if (escrow.roomCode !== roomCode || matchState.roomCode !== roomCode) {
        throw new HttpError(409, 'Room code mismatch across escrow and match-state.');
    }
    if (matchState.playerOne.toBase58() !== escrow.creator.toBase58() ||
        matchState.playerTwo.toBase58() !== escrow.opponent.toBase58()) {
        throw new HttpError(409, 'Escrow pilots and match-state pilots do not match.');
    }
    if (escrow.status === 2) {
        return {
            roomCode,
            matchStateAddress: matchStateAddress.toBase58(),
            escrowAddress: escrowAddress.toBase58(),
            finishSignature: null,
            settleSignature: null,
            alreadySettled: true,
        };
    }
    let finishSignature = null;
    if (matchState.stage !== 2) {
        finishSignature = await sendServerTransaction([
            buildFinishMatchInstruction({
                authority: env.matchArbiterKeypair.publicKey,
                matchStateAddress,
                winner: winnerWallet,
                reasonCode,
            }),
        ]);
    }
    else if (matchState.winner.toBase58() !== winnerWallet.toBase58()) {
        throw new HttpError(409, 'Winner wallet does not match the finished on-chain match-state result.');
    }
    const settleSignature = await sendServerTransaction([
        buildSettleMatchInstruction({
            arbiter: env.matchArbiterKeypair.publicKey,
            escrowAddress,
            matchStateAddress,
            winner: winnerWallet,
            disconnectWin: body.reason === 'disconnect',
        }),
    ]);
    return {
        roomCode,
        matchStateAddress: matchStateAddress.toBase58(),
        escrowAddress: escrowAddress.toBase58(),
        finishSignature,
        settleSignature,
        alreadySettled: false,
    };
}
export function toHttpError(error) {
    if (error instanceof HttpError) {
        return error;
    }
    return new HttpError(500, error instanceof Error ? error.message : 'Unexpected match service error.');
}
