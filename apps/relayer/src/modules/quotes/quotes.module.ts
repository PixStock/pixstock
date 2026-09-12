import { Module } from '@nestjs/common';
import { JupiterService } from './jupiter.service';
import { QuotesController } from './quotes.controller';

@Module({
  providers: [JupiterService],
  controllers: [QuotesController],
  exports: [JupiterService],
})
export class QuotesModule {}
