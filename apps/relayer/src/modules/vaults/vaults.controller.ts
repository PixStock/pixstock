import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { VaultsService } from './vaults.service';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

@Controller('v1/vaults')
export class VaultsController {
  constructor(private readonly vaults: VaultsService) {}

  /** Watch-only: balances and order history. Nothing here can spend. */
  @Get(':pubkey')
  @Throttle({ global: { limit: 60, ttl: 60_000 } })
  async find(@Param('pubkey') pubkey: string) {
    if (!BASE58.test(pubkey)) throw new BadRequestException('Not a Solana address');

    const [balances, orders] = await Promise.all([
      this.vaults.balances(pubkey),
      this.vaults.orders(pubkey),
    ]);

    return { vault: pubkey, balances, orders };
  }
}
