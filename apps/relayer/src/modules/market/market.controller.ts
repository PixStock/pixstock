import { Controller, Get } from '@nestjs/common';
import { ASSETS, PROGRAM_IDS, USDC_MINT } from '@pixstock/shared';
import { MintStateService } from './mint-state.service';

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
  constructor(private readonly mints: MintStateService) {}

  @Get()
  async list() {
    const states = await this.mints.all();
    const stateOf = (symbol: string) => states.find((s) => s.symbol === symbol);

    return {
      quoteMint: USDC_MINT,
      quoteDecimals: 6,
      assets: ASSETS.map((asset) => {
        const state = stateOf(asset.symbol);
        return {
          symbol: asset.symbol,
          name: asset.name,
          mint: asset.mint,
          decimals: asset.decimals,
          tokenProgram: asset.tokenProgram,
          pythFeedId: asset.pythFeedId,
          pythExtFeedId: asset.pythExtFeedId,
          // Read from the mint, not assumed. A balance is raw / 10^decimals
          // times this, and none of them is 1.
          multiplier: state?.multiplier ?? null,
          nextMultiplier: state?.nextMultiplier ?? null,
          // Stated because it is the honest limit of self-custody here.
          permanentDelegate: state?.permanentDelegate ?? null,
          paused: state?.paused ?? null,
        };
      }),
      programs: PROGRAM_IDS,
    };
  }
}
