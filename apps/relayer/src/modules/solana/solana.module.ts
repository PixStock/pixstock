import { Module } from '@nestjs/common';
import { SolanaRpcService } from './solana-rpc.service';

@Module({
  providers: [SolanaRpcService],
  exports: [SolanaRpcService],
})
export class SolanaModule {}
