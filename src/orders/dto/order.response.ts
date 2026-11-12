import { Order } from '../order.entity';
import { OrderSide } from '../order-side.enum';
import { OrderStatus } from '../order-status.enum';
import { OrderType } from '../order-type.enum';

export class OrderResponse {
  id!: number;
  userId!: number;
  instrumentId!: number;
  side!: OrderSide;
  type!: OrderType;
  size!: number;
  price!: number;
  status!: OrderStatus;
  datetime!: Date;

  static fromEntity(order: Order): OrderResponse {
    const response = new OrderResponse();
    response.id = order.id;
    response.userId = order.userId;
    response.instrumentId = order.instrumentId;
    response.side = order.side;
    response.type = order.type;
    response.size = order.size;
    response.price = order.price;
    response.status = order.status;
    response.datetime = order.datetime;
    return response;
  }
}
