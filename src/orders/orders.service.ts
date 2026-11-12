import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { MAX_POSTGRES_INT } from '../common/limits';
import { fromCents, toCents } from '../common/money';
import { Instrument } from '../instruments/instrument.entity';
import { InstrumentType } from '../instruments/instrument-type.enum';
import { CreateOrderBody } from './dto/create-order.body';
import { Order } from './order.entity';
import { OrderSide } from './order-side.enum';
import { OrderStatus } from './order-status.enum';
import { OrderType } from './order-type.enum';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountsService: AccountsService,
  ) {}

  async create(body: CreateOrderBody): Promise<Order> {
    this.assertValidCombination(body);

    // READ COMMITTED on purpose: after the lock, reads must see new orders.
    return this.dataSource.transaction(async (manager) => {
      await this.accountsService.lockUser(manager, body.userId);
      await this.assertTradable(manager, body.instrumentId);

      const priceCents =
        body.type === OrderType.LIMIT
          ? toCents(body.price!)
          : await this.findLastPriceCents(manager, body.instrumentId);
      const size = body.size ?? Math.floor(toCents(body.amount!) / priceCents);
      if (size > MAX_POSTGRES_INT) {
        throw new BadRequestException('amount is too large for this price');
      }

      const accepted =
        size > 0 && (await this.canAfford(manager, body, size, priceCents));

      return manager.save(
        manager.create(Order, {
          userId: body.userId,
          instrumentId: body.instrumentId,
          side: body.side,
          type: body.type,
          size,
          price: fromCents(priceCents),
          status: this.resolveStatus(body.type, accepted),
          datetime: new Date(),
        }),
      );
    });
  }

  private assertValidCombination(body: CreateOrderBody): void {
    if ((body.size === undefined) === (body.amount === undefined)) {
      throw new BadRequestException('send either size or amount');
    }
    if (body.type === OrderType.LIMIT && body.price === undefined) {
      throw new BadRequestException('price is required for LIMIT orders');
    }
    if (body.type === OrderType.MARKET && body.price !== undefined) {
      throw new BadRequestException('price is not allowed for MARKET orders');
    }
  }

  private async assertTradable(
    manager: EntityManager,
    instrumentId: number,
  ): Promise<void> {
    const instrument = await manager.findOneBy(Instrument, {
      id: instrumentId,
    });
    if (!instrument || instrument.type === InstrumentType.CASH) {
      throw new BadRequestException(
        `Instrument ${instrumentId} cannot be traded`,
      );
    }
  }

  private async findLastPriceCents(
    manager: EntityManager,
    instrumentId: number,
  ): Promise<number> {
    const [latest] = await manager.query<{ close: string | null }[]>(
      'SELECT close FROM marketdata WHERE instrumentid = $1 ORDER BY date DESC LIMIT 1',
      [instrumentId],
    );
    if (!latest || latest.close === null) {
      throw new UnprocessableEntityException(
        `Instrument ${instrumentId} has no market price`,
      );
    }
    return toCents(latest.close);
  }

  private async canAfford(
    manager: EntityManager,
    body: CreateOrderBody,
    size: number,
    priceCents: number,
  ): Promise<boolean> {
    if (body.side === OrderSide.BUY) {
      const cash = await this.accountsService.findCash(manager, body.userId);
      return size * priceCents <= cash.availableCents;
    }
    const shares = await this.accountsService.findAvailableShares(
      manager,
      body.userId,
      body.instrumentId,
    );
    return size <= shares;
  }

  private resolveStatus(type: OrderType, accepted: boolean): OrderStatus {
    if (!accepted) {
      return OrderStatus.REJECTED;
    }
    return type === OrderType.MARKET ? OrderStatus.FILLED : OrderStatus.NEW;
  }
}
