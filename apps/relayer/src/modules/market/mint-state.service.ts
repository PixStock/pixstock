import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicKey, type AccountInfo } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getPausableConfig,
  getPermanentDelegate,
  getScaledUiAmountConfig,
  unpackMint,
} from '@solana/spl-token';
import { ASSETS, isScaledMint, normaliseMultiplier, type MintFacts } from '@pixstock/shared';
import { SolanaService } from '../solana/solana.service';

export interface MintState {
  symbol: string;
  mint: string;
  /**
   * The ScaledUiAmount multiplier IN FORCE, which is not simply the mint's
   * `multiplier` field.
   *
   * The extension stores two multipliers and a switchover timestamp, and the
   * program picks between them by the clock:
   *
   *     multiplier = now >= newMultiplierEffectiveTimestamp
   *                ? newMultiplier
   *                : multiplier
   *
   * (token-2022 `process_amount_to_ui_amount`.) Reading the first field alone
   * returns the superseded value once a scheduled change has landed, which on
   * 12 Sept 2026 it had on four of the five xStocks — understating balances by
   * up to 0.18%. `mint-state.live.test.ts` checks this against the program's
   * own answer, which is the only thing that can.
   */
  multiplier: number;
  /** The multiplier scheduled next, or the current one when none is pending. */
  nextMultiplier: number;
  /** When `nextMultiplier` takes over, or null when nothing is pending. */
  nextMultiplierEffectiveAt: number | null;
  /** The issuer can move these tokens out of any account, unprompted. */
  permanentDelegate: string | null;
  /** The issuer can stop every transfer of this mint. */
  paused: boolean;
  readAt: number;
}

/** Multipliers drift slowly; re-reading them every few minutes is plenty. */
const TTL_MS = 5 * 60_000;

/**
 * The parts of an xStock mint that change and that a balance depends on.
 *
 * An offline vault cannot read any of this, which is why it has to travel
 * with an order rather than be looked up — and why the vault should say where
 * the number came from.
 */
@Injectable()
export class MintStateService {
  private readonly logger = new Logger(MintStateService.name);
  private cache: { states: MintState[]; expiresAt: number } | null = null;

  constructor(
    private readonly solana: SolanaService,
    private readonly config: ConfigService,
  ) {}

  async all(): Promise<MintState[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.states;

    // One request for all five, not five. Five concurrent reads is also how
    // the public endpoint decides you are abusing it and answers with
    // nothing, which unpacks as "account not found" and reads like the mint
    // vanished.
    const keys = ASSETS.map((asset) => new PublicKey(asset.mint));
    const infos = await this.solana.rpc.getMultipleAccountsInfo(keys, 'confirmed');

    const states = ASSETS.map((asset, i) => this.read(asset.symbol, asset.mint, infos[i] ?? null));
    this.cache = { states, expiresAt: Date.now() + TTL_MS };
    return states;
  }

  async bySymbol(symbol: string): Promise<MintState | undefined> {
    return (await this.all()).find((state) => state.symbol === symbol);
  }

  async byMint(mint: string): Promise<MintState | undefined> {
    return (await this.all()).find((state) => state.mint === mint);
  }

  /**
   * What an order carries across the gap for the mints it touches.
   *
   * Only mints that actually scale: USDC has no multiplier, and declaring one
   * for it is a P11 violation on the other side rather than harmless noise.
   */
  async factsFor(mints: readonly string[]): Promise<MintFacts[]> {
    const wanted = [...new Set(mints)].filter((mint) => isScaledMint(mint));
    if (wanted.length === 0) return [];

    const states = await this.all();
    return wanted.map((mint) => {
      const state = states.find((s) => s.mint === mint);
      // The table says this mint scales, so a missing reading is a missing
      // number, not a multiplier of 1. Refuse rather than understate.
      if (!state) throw new Error(`No mint state for ${mint}`);
      return {
        mint,
        multiplier: state.multiplier,
        ...(state.nextMultiplierEffectiveAt !== null && state.nextMultiplier !== state.multiplier
          ? {
              nextMultiplier: state.nextMultiplier,
              nextMultiplierAt: state.nextMultiplierEffectiveAt,
            }
          : {}),
        ...(state.permanentDelegate ? { permanentDelegate: state.permanentDelegate } : {}),
        ...(state.paused ? { paused: true } : {}),
        readAt: state.readAt,
      };
    });
  }

  private read(symbol: string, mint: string, account: AccountInfo<Buffer> | null): MintState {
    try {
      // Naming the cluster matters: the relayer's default is devnet, where
      // these mainnet mints do not exist, and "account not found" alone sends
      // you looking at the mint instead of at the endpoint.
      if (!account) {
        throw new Error(
          `no account at ${mint} on ${this.config.get<string>('solana.cluster')} — ` +
            `check SOLANA_CLUSTER and SOLANA_RPC_URL`,
        );
      }
      const info = unpackMint(new PublicKey(mint), account, TOKEN_2022_PROGRAM_ID);
      const scaled = getScaledUiAmountConfig(info);
      const pausable = getPausableConfig(info);
      const delegate = getPermanentDelegate(info);
      const now = Math.floor(Date.now() / 1000);

      // Local time stands in for the cluster clock. They differ by seconds,
      // and these switchovers are scheduled days apart, so the only case it
      // could get wrong is one within seconds of landing — which the ticket
      // discloses as pending anyway.
      const effectiveAt = scaled ? Number(scaled.newMultiplierEffectiveTimestamp) : 0;
      const pending = scaled && now < effectiveAt;

      return {
        symbol,
        mint,
        // Normalised at the source so the figure stored, sent and printed is
        // the same one in every place it appears.
        multiplier: scaled
          ? normaliseMultiplier(Number(pending ? scaled.multiplier : scaled.newMultiplier))
          : 1,
        nextMultiplier: scaled ? normaliseMultiplier(Number(scaled.newMultiplier)) : 1,
        nextMultiplierEffectiveAt: pending ? effectiveAt : null,
        permanentDelegate: delegate ? delegate.delegate.toBase58() : null,
        paused: pausable?.paused ?? false,
        readAt: now,
      };
    } catch (err) {
      // A multiplier we could not read is not a multiplier of 1 — that would
      // quietly understate a balance. Say so instead.
      this.logger.warn(`Could not read ${symbol}: ${(err as Error).message}`);
      throw err;
    }
  }
}
