import { Module } from '@nestjs/common';
import { QuotesModule } from '../quotes/quotes.module';
import { SolanaModule } from '../solana/solana.module';
import { TxBuilderService } from './tx-builder.service';

@Module({
  imports: [QuotesModule, SolanaModule],
  providers: [TxBuilderService],
  exports: [TxBuilderService],
})
export class TxBuilderModule {}
