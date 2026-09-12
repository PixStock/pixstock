import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { SubmitSignatureDto } from './dto/submit-signature.dto';

@Controller('v1/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Builds and stores an order. Nothing is signed or sent here. */
  @Post()
  @Throttle({ global: { limit: 10, ttl: 60_000 } })
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }

  @Get(':id')
  @Throttle({ global: { limit: 120, ttl: 60_000 } })
  find(@Param('id') id: string) {
    return this.orders.find(id);
  }

  @Post(':id/signature')
  @Throttle({ global: { limit: 20, ttl: 60_000 } })
  submit(@Param('id') id: string, @Body() dto: SubmitSignatureDto) {
    return this.orders.submitSignature(id, dto.signatures);
  }
}
