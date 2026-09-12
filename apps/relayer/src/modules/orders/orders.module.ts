import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { NoncesModule } from '../nonces/nonces.module';
import { RelayerModule } from '../relayer/relayer.module';
import { TxBuilderModule } from '../tx-builder/tx-builder.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [TxBuilderModule, RelayerModule, NoncesModule, MarketModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
