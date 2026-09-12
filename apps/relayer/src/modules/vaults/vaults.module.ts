import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { SolanaModule } from '../solana/solana.module';
import { VaultsController } from './vaults.controller';
import { VaultsService } from './vaults.service';

@Module({
  imports: [SolanaModule, MarketModule],
  controllers: [VaultsController],
  providers: [VaultsService],
})
export class VaultsModule {}
