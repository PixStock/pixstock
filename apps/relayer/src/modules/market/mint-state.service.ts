import { Injectable, Logger } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getPausableConfig,
  getPermanentDelegate,
  getScaledUiAmountConfig,
} from '@solana/spl-token';
import { ASSETS } from '@pixstock/shared';
import { SolanaService } from '../solana/solana.service';

export interface MintState {
  symbol: string;
  mint: string;
  /**
   * Token-2022 ScaledUiAmount. A balance is `raw / 10^decimals * multiplier`,
   * and none of these is 1 — showing the unscaled figure is showing the wrong
   * number.
   */
  multiplier: number;
  /** The multiplier that takes over at `newMultiplierEffectiveTimestamp`. */
  nextMultiplier: number;
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

  constructor(private readonly solana: SolanaService) {}

  async all(): Promise<MintState[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.states;

    const states = await Promise.all(ASSETS.map((asset) => this.read(asset.symbol, asset.mint)));
    this.cache = { states, expiresAt: Date.now() + TTL_MS };
    return states;
  }

  async bySymbol(symbol: string): Promise<MintState | undefined> {
    return (await this.all()).find((state) => state.symbol === symbol);
  }

  private async read(symbol: string, mint: string): Promise<MintState> {
    try {
      const info = await getMint(
        this.solana.rpc,
        new PublicKey(mint),
        'confirmed',
        TOKEN_2022_PROGRAM_ID,
      );
      const scaled = getScaledUiAmountConfig(info);
      const pausable = getPausableConfig(info);
      const delegate = getPermanentDelegate(info);

      return {
        symbol,
        mint,
        multiplier: scaled ? Number(scaled.multiplier) : 1,
        nextMultiplier: scaled ? Number(scaled.newMultiplier) : 1,
        permanentDelegate: delegate ? delegate.delegate.toBase58() : null,
        paused: pausable?.paused ?? false,
        readAt: Math.floor(Date.now() / 1000),
      };
    } catch (err) {
      // A multiplier we could not read is not a multiplier of 1 — that would
      // quietly understate a balance. Say so instead.
      this.logger.warn(`Could not read ${symbol}: ${(err as Error).message}`);
      throw err;
    }
  }
}
