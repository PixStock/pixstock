import { Module } from '@nestjs/common';
import { SolanaModule } from '../solana/solana.module';
import { RelayerService } from './relayer.service';

@Module({
  imports: [SolanaModule],
  providers: [RelayerService],
  exports: [RelayerService],
})
export class RelayerModule {}
