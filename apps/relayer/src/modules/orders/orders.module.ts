import { Module } from '@nestjs/common';
import { TxBuilderModule } from '../tx-builder/tx-builder.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [TxBuilderModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
