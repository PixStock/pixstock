import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { symbolOfMint } from '@pixstock/shared';
import { JupiterService } from './jupiter.service';
import { GetQuoteDto } from './dto/get-quote.dto';

@Controller('v1/quotes')
export class QuotesController {
  constructor(private readonly jupiter: JupiterService) {}

  /**
   * A preview for the web app. Nothing is built or stored here — an order is
   * only created by `POST /v1/orders`.
   */
  @Get()
  @Throttle({ global: { limit: 60, ttl: 60_000 } })
  async quote(@Query() query: GetQuoteDto) {
    this.jupiter.sweep();

    const quote = await this.jupiter.quote({
      inputMint: query.in,
      outputMint: query.out,
      amount: query.amount,
      slippageBps: query.slippageBps,
      onlyDirectRoutes: query.onlyDirectRoutes,
    });

    return {
      in: { mint: quote.inputMint, symbol: symbolOfMint(quote.inputMint), amount: quote.inAmount },
      out: { mint: quote.outputMint, symbol: symbolOfMint(quote.outputMint), amount: quote.outAmount },
      minOutAmount: quote.otherAmountThreshold,
      slippageBps: quote.slippageBps,
      priceImpactPct: quote.priceImpactPct,
      route: quote.route,
    };
  }
}
