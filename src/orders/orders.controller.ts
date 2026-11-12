import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { CancelOrderParams } from './dto/cancel-order.params';
import { CreateOrderBody } from './dto/create-order.body';
import { OrderResponse } from './dto/order.response';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(@Body() body: CreateOrderBody): Promise<OrderResponse> {
    const order = await this.ordersService.create(body);
    return OrderResponse.fromEntity(order);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Param() params: CancelOrderParams): Promise<OrderResponse> {
    const order = await this.ordersService.cancel(params.id);
    return OrderResponse.fromEntity(order);
  }
}
