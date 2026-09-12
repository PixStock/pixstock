import { Injectable } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackAccount } from '@solana/spl-token';
import { ASSETS, USDC, USDC_MINT, scaledUiAmount } from '@pixstock/shared';
import { deriveAta } from '@pixstock/tx-policy';
import { DatabaseService } from '../../database/database.service';
import { MintStateService } from '../market/mint-state.service';
import { SolanaService } from '../solana/solana.service';

export interface VaultBalance {
  symbol: string;
  mint: string;
  account: string;
  /** Raw u64, as a string. The only figure that is exact. */
  raw: string;
  decimals: number;
  /** ScaledUiAmount multiplier from the mint. 1 for USDC, never 1 for xStocks. */
  multiplier: number;
  /** What the holder actually owns: raw / 10^decimals * multiplier. */
  amount: number;
  /** False when the account has not been created yet. */
  exists: boolean;
  frozen: boolean;
}

/**
 * Watch-only. Nothing here can move an asset — it derives the accounts a vault
 * would own and reads them.
 *
 * Accounts are derived rather than looked up by owner: being told "this is
 * your token account" is exactly what an attacker would say, and the vault
 * derives the same addresses offline from the same table.
 */
@Injectable()
export class VaultsService {
  constructor(
    private readonly solana: SolanaService,
    private readonly mints: MintStateService,
    private readonly db: DatabaseService,
  ) {}

  async balances(vault: string): Promise<VaultBalance[]> {
    const states = await this.mints.all();

    const wanted = [
      {
        symbol: USDC.symbol,
        mint: USDC_MINT,
        decimals: USDC.decimals,
        program: TOKEN_PROGRAM_ID.toBase58(),
        multiplier: 1,
      },
      ...ASSETS.map((asset) => ({
        symbol: asset.symbol,
        mint: asset.mint,
        decimals: asset.decimals,
        program: asset.tokenProgram,
        multiplier: states.find((s) => s.symbol === asset.symbol)?.multiplier ?? 1,
      })),
    ];

    const addresses = wanted.map((item) => deriveAta(vault, item.mint, item.program));
    const accounts = await this.solana.rpc.getMultipleAccountsInfo(
      addresses.map((address) => new PublicKey(address)),
    );

    return wanted.map((item, i) => {
      const address = addresses[i]!;
      const info = accounts[i];

      if (!info) {
        return {
          symbol: item.symbol,
          mint: item.mint,
          account: address,
          raw: '0',
          decimals: item.decimals,
          multiplier: item.multiplier,
          amount: 0,
          exists: false,
          frozen: false,
        };
      }

      const owner = item.program === TOKEN_2022_PROGRAM_ID.toBase58()
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;
      const account = unpackAccount(new PublicKey(address), info, owner);

      return {
        symbol: item.symbol,
        mint: item.mint,
        account: address,
        raw: account.amount.toString(),
        decimals: item.decimals,
        multiplier: item.multiplier,
        amount: scaledUiAmount(account.amount, item.decimals, item.multiplier),
        exists: true,
        frozen: account.isFrozen,
      };
    });
  }

  /** Recent orders for this vault. Read from our own database, not the chain. */
  async orders(vault: string, take = 20) {
    const orders = await this.db.order.findMany({
      where: { vault },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        kind: true,
        status: true,
        txSignatures: true,
        error: true,
        createdAt: true,
      },
    });

    return orders.map((order) => ({
      orderId: order.id,
      kind: order.kind,
      status: order.status,
      txSignatures: order.txSignatures,
      error: order.error,
      createdAt: order.createdAt.toISOString(),
    }));
  }
}
