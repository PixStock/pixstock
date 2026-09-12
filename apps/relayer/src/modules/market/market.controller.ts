import { Controller, Get } from '@nestjs/common';
import { ASSETS, PROGRAM_IDS, USDC_MINT } from '@pixstock/shared';

/**
 * `GET /v1/assets` — the catalogue the web app draws from and the vault checks
 * against.
 *
 * Served from @pixstock/shared rather than a database: these are mainnet
 * constants, and the vault derives its own token accounts from the same table.
 * A catalogue the relayer could edit at runtime would be a catalogue an
 * attacker could edit.
 */
@Controller('v1/assets')
export class MarketController {
  @Get()
  list() {
    return {
      quoteMint: USDC_MINT,
      quoteDecimals: 6,
      assets: ASSETS.map((asset) => ({
        symbol: asset.symbol,
        name: asset.name,
        mint: asset.mint,
        decimals: asset.decimals,
        tokenProgram: asset.tokenProgram,
        pythFeedId: asset.pythFeedId,
        pythExtFeedId: asset.pythExtFeedId,
      })),
      programs: PROGRAM_IDS,
    };
  }
}
