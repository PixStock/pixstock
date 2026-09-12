import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MintInfo {
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

interface RpcMintAccountResponse {
  result?: {
    value?: {
      data?: {
        parsed?: {
          type?: string;
          info?: { decimals: number; mintAuthority: string | null; freezeAuthority: string | null };
        };
      } | null;
    } | null;
  };
  error?: { message: string };
}

@Injectable()
export class SolanaRpcService {
  private readonly logger = new Logger(SolanaRpcService.name);
  private readonly endpoint: string;

  constructor(config: ConfigService) {
    this.endpoint = config.get<string>('solana.rpcUrl', 'https://api.mainnet-beta.solana.com');
  }

  /**
   * Mint/freeze authority, read straight off the SPL Token mint account —
   * one cheap RPC call, real data. Deliberately does NOT fetch holder count
   * or top-10 concentration here: `getTokenLargestAccounts` and
   * `getProgramAccounts` were tested against this same public endpoint and
   * are too unreliable to serve synchronously (immediate 429, and a 20s
   * timeout respectively) — that needs a dedicated indexer or a paid Helius
   * endpoint, not a per-request call on the free RPC.
   */
  async getMintInfo(mint: string): Promise<MintInfo | null> {
    let body: RpcMintAccountResponse;
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [mint, { encoding: 'jsonParsed' }],
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Solana RPC responded ${res.status} for mint ${mint}`);
        return null;
      }
      body = (await res.json()) as RpcMintAccountResponse;
    } catch (err) {
      this.logger.warn(`Solana RPC request failed for mint ${mint}: ${(err as Error).message}`);
      return null;
    }

    if (body.error) {
      this.logger.warn(`Solana RPC error for mint ${mint}: ${body.error.message}`);
      return null;
    }

    const parsed = body.result?.value?.data?.parsed;
    if (!parsed || parsed.type !== 'mint' || !parsed.info) return null;

    return {
      decimals: parsed.info.decimals,
      mintAuthority: parsed.info.mintAuthority,
      freezeAuthority: parsed.info.freezeAuthority,
    };
  }
}
