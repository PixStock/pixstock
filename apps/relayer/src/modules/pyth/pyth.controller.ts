import { Controller, Get, Query } from '@nestjs/common';
import { PythService } from './pyth.service';

/**
 * `GET /v1/prices` — what Pyth currently says each asset costs.
 *
 * For display only, and the response says so: the web app cannot prove any of
 * it. Proof happens on the phone, against the signed bytes that travel with
 * the order — which is the whole point, and why this endpoint is not on the
 * path of anything that gets signed.
 */
@Controller('v1/prices')
export class PythController {
  constructor(private readonly pyth: PythService) {}

  @Get()
  list(@Query('symbols') symbols?: string) {
    const wanted = symbols
      ?.split(',')
      .map((symbol) => symbol.trim())
      .filter(Boolean);

    return {
      prices: this.pyth.prices(wanted),
      stream: this.pyth.status(),
      verifiedBy: 'the vault, offline, against the signature that travels with the order',
    };
  }
}
