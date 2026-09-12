import { Module } from '@nestjs/common';
import { SolanaModule } from '../solana/solana.module';
import { NoncesService } from './nonces.service';

@Module({
  imports: [SolanaModule],
  providers: [NoncesService],
  exports: [NoncesService],
})
export class NoncesModule {}
