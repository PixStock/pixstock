import { Module } from '@nestjs/common';
import { SolanaModule } from '../solana/solana.module';
import { MarketController } from './market.controller';
import { MintStateService } from './mint-state.service';

@Module({
  imports: [SolanaModule],
  controllers: [MarketController],
  providers: [MintStateService],
  exports: [MintStateService],
})
export class MarketModule {}
