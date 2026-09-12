import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  type MessageV0,
} from '@solana/web3.js';
import { decimalsOfMint, type OrderKind } from '@pixstock/shared';
import { JupiterService, type Quote } from '../quotes/jupiter.service';
import { toInstruction, toLookupTables } from '../quotes/swap-instructions';
import { SolanaService } from '../solana/solana.service';

/** A Solana transaction may not exceed this, signatures included. */
export const MAX_TRANSACTION_BYTES = 1232;

export interface BuildLeg {
  inMint: string;
  outMint: string;
  /** Raw amount of `inMint`. */
  inAmount: string;
}

export interface BuildRequest {
  vault: string;
  feePayer: string;
  legs: BuildLeg[];
  slippageBps: number;
  /**
   * Durable nonce account and its current value. Without one the message is
   * tied to a recent blockhash and expires in about a minute — far too short
   * for a scan, a read and a biometric confirmation, which is exactly why the
   * design calls for a nonce.
   */
  nonce?: { account: string; authority: string; value: string };
  recentBlockhash?: string;
  /**
   * Skip the idempotent token-account creations.
   *
   * Each one drags four or five fresh account keys into the message at 32
   * bytes apiece, which is where a basket's size actually goes. When the
   * vault's accounts already exist they are pure waste — so the relayer
   * checks on chain and omits them. Measured both ways by
   * `scripts/measure-tx-size.mjs`.
   */
  assumeTokenAccountsExist?: boolean;
}

export interface BuiltLeg extends BuildLeg {
  expectedOutAmount: string;
  minOutAmount: string;
  route: string[];
}

export interface BuiltOrder {
  kind: OrderKind;
  /** Serialized unsigned v0 messages. More than one only when a basket splits. */
  messages: Uint8Array[];
  sizes: number[];
  legs: BuiltLeg[];
  expiry: 'durable-nonce' | 'blockhash';
}

/** Bytes a compact-u16 length prefix occupies. */
function shortVecBytes(value: number): number {
  if (value < 0x80) return 1;
  if (value < 0x4000) return 2;
  return 3;
}

/**
 * Size of the signed transaction, counted rather than serialized.
 *
 * `VersionedTransaction.serialize()` allocates a single network packet and
 * throws on overrun, so it can tell you a transaction is too big but never by
 * how much. That number is what decides whether trimming is worth trying or
 * the basket has to be split, so it is computed here from the message itself.
 *
 * The field order matches `packages/tx-policy/src/message.ts`, which reads
 * the same bytes back on the other side of the gap.
 */
export function transactionSize(message: MessageV0): number {
  const signatures =
    shortVecBytes(message.header.numRequiredSignatures) + 64 * message.header.numRequiredSignatures;

  const keys = message.staticAccountKeys.length;
  let size = 1 + 3 + shortVecBytes(keys) + 32 * keys + 32;

  size += shortVecBytes(message.compiledInstructions.length);
  for (const ix of message.compiledInstructions) {
    size +=
      1 +
      shortVecBytes(ix.accountKeyIndexes.length) +
      ix.accountKeyIndexes.length +
      shortVecBytes(ix.data.length) +
      ix.data.length;
  }

  size += shortVecBytes(message.addressTableLookups.length);
  for (const lookup of message.addressTableLookups) {
    size +=
      32 +
      shortVecBytes(lookup.writableIndexes.length) +
      lookup.writableIndexes.length +
      shortVecBytes(lookup.readonlyIndexes.length) +
      lookup.readonlyIndexes.length;
  }

  return signatures + size;
}

@Injectable()
export class TxBuilderService {
  private readonly logger = new Logger(TxBuilderService.name);

  constructor(
    private readonly jupiter: JupiterService,
    private readonly solana: SolanaService,
  ) {}

  /**
   * Turns legs into the smallest number of transactions that will fit.
   *
   * The vault is never the fee payer and never appears as the payer of any
   * System instruction — that is the property `P1` checks on the other side,
   * and it is established here.
   */
  async build(request: BuildRequest): Promise<BuiltOrder> {
    if (request.legs.length === 0) throw new BadRequestException('An order needs at least one leg');
    if (request.vault === request.feePayer) {
      // Would defeat the entire point: the vault would fund its own fees.
      throw new BadRequestException('The vault cannot be the fee payer');
    }
    for (const leg of request.legs) {
      decimalsOfMint(leg.inMint);
      decimalsOfMint(leg.outMint);
    }

    const prepared = await Promise.all(
      request.legs.map(async (leg) => {
        const quote = await this.jupiter.quote({
          inputMint: leg.inMint,
          outputMint: leg.outMint,
          amount: leg.inAmount,
          slippageBps: request.slippageBps,
          // Direct routes and a capped account count keep a multi-leg basket
          // inside one transaction. Without both, two legs already overrun.
          onlyDirectRoutes: request.legs.length > 1,
          maxAccounts: request.legs.length > 1 ? 20 : undefined,
        });
        const swap = await this.jupiter.swapInstructions(quote, request.vault, request.feePayer);
        return { leg, quote, swap };
      }),
    );

    const built = await this.compileAll(request, prepared);

    if (built.sizes.every((size) => size <= MAX_TRANSACTION_BYTES)) return built;

    if (prepared.length === 1) {
      throw new BadRequestException(
        `This swap does not fit in one transaction (${built.sizes[0]} bytes, limit ${MAX_TRANSACTION_BYTES}). Try a smaller amount.`,
      );
    }

    // Split down the middle and compile each half. Two signatures instead of
    // one, and the vault's ticket says so rather than hiding it.
    const half = Math.ceil(prepared.length / 2);
    this.logger.log(`Basket is ${built.sizes[0]} bytes, over ${MAX_TRANSACTION_BYTES}; splitting in two`);

    const first = await this.compileAll(request, prepared.slice(0, half));
    const second = await this.compileAll(request, prepared.slice(half));

    const oversized = [...first.sizes, ...second.sizes].find((s) => s > MAX_TRANSACTION_BYTES);
    if (oversized) {
      throw new BadRequestException(
        `This basket does not fit even when split (${oversized} bytes, limit ${MAX_TRANSACTION_BYTES})`,
      );
    }

    return {
      kind: built.kind,
      messages: [...first.messages, ...second.messages],
      sizes: [...first.sizes, ...second.sizes],
      legs: built.legs,
      expiry: built.expiry,
    };
  }

  private async compileAll(
    request: BuildRequest,
    prepared: Array<{ leg: BuildLeg; quote: Quote; swap: ReturnType<JupiterService['swapInstructions']> extends Promise<infer T> ? T : never }>,
  ): Promise<BuiltOrder> {
    const instructions: TransactionInstruction[] = [];

    // The nonce advance must come first, before anything else in the message.
    if (request.nonce) {
      instructions.push(
        SystemProgram.nonceAdvance({
          noncePubkey: new PublicKey(request.nonce.account),
          authorizedPubkey: new PublicKey(request.nonce.authority),
        }),
      );
    }

    // One compute budget for the whole transaction, not one per leg.
    const units = prepared.length === 1 ? 400_000 : 250_000 * prepared.length;
    instructions.push(ComputeBudgetProgram.setComputeUnitLimit({ units }));

    // Legs share a source account, so Jupiter returns the same idempotent ATA
    // creation for each of them. Sending it three times costs bytes and
    // achieves nothing.
    const seenSetup = new Set<string>();
    if (!request.assumeTokenAccountsExist)
    for (const { swap } of prepared) {
      for (const setup of swap.setupInstructions) {
        const key = `${setup.programId}:${setup.accounts.map((a) => a.pubkey).join(',')}:${setup.data}`;
        if (seenSetup.has(key)) continue;
        seenSetup.add(key);
        instructions.push(toInstruction(setup));
      }
    }
    for (const { swap } of prepared) instructions.push(toInstruction(swap.swapInstruction));
    for (const { swap } of prepared) {
      if (swap.cleanupInstruction) instructions.push(toInstruction(swap.cleanupInstruction));
    }

    // Jupiter names the tables but returns their contents empty, so anything
    // it did not inline has to be read from chain.
    const inlined = prepared.flatMap(({ swap }) => toLookupTables(swap));
    const inlinedKeys = new Set(inlined.map((table) => table.key.toBase58()));
    const unresolved = [
      ...new Set(
        prepared
          .flatMap(({ swap }) => swap.addressLookupTableAddresses)
          .filter((address) => !inlinedKeys.has(address)),
      ),
    ];
    const lookupTables = [...inlined, ...(await this.solana.getLookupTables(unresolved))];

    const message = new TransactionMessage({
      payerKey: new PublicKey(request.feePayer),
      recentBlockhash: request.nonce?.value ?? request.recentBlockhash ?? PublicKey.default.toBase58(),
      instructions,
    }).compileToV0Message(lookupTables);

    // Measure before serializing: web3.js allocates a single packet and throws
    // on overrun, which would turn "too big, split it" into a crash.
    const size = transactionSize(message);

    return {
      kind: prepared.length > 1 ? 'BASKET' : 'BUY',
      messages: size <= MAX_TRANSACTION_BYTES ? [message.serialize()] : [],
      sizes: [size],
      legs: prepared.map(({ leg, quote }) => ({
        ...leg,
        expectedOutAmount: quote.outAmount,
        minOutAmount: quote.otherAmountThreshold,
        route: quote.route,
      })),
      expiry: request.nonce ? 'durable-nonce' : 'blockhash',
    };
  }
}
