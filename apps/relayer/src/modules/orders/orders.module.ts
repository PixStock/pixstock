import { Module } from '@nestjs/common';
import { RelayerModule } from '../relayer/relayer.module';
import { TxBuilderModule } from '../tx-builder/tx-builder.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [TxBuilderModule, RelayerModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
