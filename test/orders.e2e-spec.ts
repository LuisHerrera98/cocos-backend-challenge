import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { OrderResponse } from '../src/orders/dto/order.response';
import { OrderStatus } from '../src/orders/order-status.enum';
import { PortfolioResponse } from '../src/portfolio/dto/portfolio.response';

// Values from database.sql. User 4 has no orders there, so the tests own it.
const USER_ID = 4;
const ARS_ID = 66;
const PAMP_ID = 47;
const PAMP_LAST_CLOSE = 925.85;
const INITIAL_CASH = 10000;

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const sendOrder = (body: object) =>
    request(app.getHttpServer()).post('/orders').send(body);

  const cancelOrder = (orderId: number) =>
    request(app.getHttpServer()).post(`/orders/${orderId}/cancel`);

  const getPortfolio = async (): Promise<PortfolioResponse> => {
    const response = await request(app.getHttpServer())
      .get(`/users/${USER_ID}/portfolio`)
      .expect(200);
    return response.body as PortfolioResponse;
  };

  const countOrders = async (): Promise<number> => {
    const [row] = await dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*)::int AS count FROM orders WHERE userid = $1',
      [USER_ID],
    );
    return row.count;
  };

  const clearOrders = () =>
    dataSource.query('DELETE FROM orders WHERE userid = $1', [USER_ID]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // These tests write and delete orders: never run them on a shared database.
    const databaseUrl = moduleRef
      .get(ConfigService)
      .getOrThrow<string>('DATABASE_URL');
    if (!['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname)) {
      await moduleRef.close();
      throw new Error('e2e tests only run against a local database');
    }

    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await clearOrders();
    await dataSource.query(
      `INSERT INTO orders (instrumentid, userid, size, price, side, status, type, datetime)
       VALUES ($1, $2, $3, 1, 'CASH_IN', 'FILLED', 'MARKET', NOW())`,
      [ARS_ID, USER_ID, INITIAL_CASH],
    );
  });

  afterAll(async () => {
    // Both stay undefined when the database check above fails.
    if (dataSource) {
      await clearOrders();
    }
    await app?.close();
  });

  describe('POST /orders', () => {
    it('fills a MARKET buy at the last close price', async () => {
      const response = await sendOrder({
        userId: USER_ID,
        instrumentId: PAMP_ID,
        side: 'BUY',
        type: 'MARKET',
        size: 2,
      }).expect(201);

      const order = response.body as OrderResponse;
      expect(order.status).toBe(OrderStatus.FILLED);
      expect(order.price).toBe(PAMP_LAST_CLOSE);
      expect(order.size).toBe(2);

      const portfolio = await getPortfolio();
      expect(portfolio.availableCash).toBe(8148.3);
      expect(portfolio.totalValue).toBe(INITIAL_CASH);
      expect(portfolio.positions).toHaveLength(1);
      expect(portfolio.positions[0].quantity).toBe(2);
    });

    it('keeps a LIMIT buy as NEW and reserves its cost', async () => {
      const response = await sendOrder({
        userId: USER_ID,
        instrumentId: PAMP_ID,
        side: 'BUY',
        type: 'LIMIT',
        size: 5,
        price: 900,
      }).expect(201);

      expect((response.body as OrderResponse).status).toBe(OrderStatus.NEW);

      const portfolio = await getPortfolio();
      expect(portfolio.availableCash).toBe(5500);
      expect(portfolio.totalValue).toBe(INITIAL_CASH);
      expect(portfolio.positions).toHaveLength(0);
    });

    it('buys the most whole shares an amount can pay for', async () => {
      const response = await sendOrder({
        userId: USER_ID,
        instrumentId: PAMP_ID,
        side: 'BUY',
        type: 'MARKET',
        amount: 3000,
      }).expect(201);

      const order = response.body as OrderResponse;
      expect(order.status).toBe(OrderStatus.FILLED);
      expect(order.size).toBe(3);
    });

    it('saves a buy the cash does not cover as REJECTED', async () => {
      const response = await sendOrder({
        userId: USER_ID,
        instrumentId: PAMP_ID,
        side: 'BUY',
        type: 'MARKET',
        size: 100,
      }).expect(201);

      expect((response.body as OrderResponse).status).toBe(
        OrderStatus.REJECTED,
      );
      expect((await getPortfolio()).availableCash).toBe(INITIAL_CASH);
    });

    it('saves a sell of shares the user does not hold as REJECTED', async () => {
      const response = await sendOrder({
        userId: USER_ID,
        instrumentId: PAMP_ID,
        side: 'SELL',
        type: 'MARKET',
        size: 1,
      }).expect(201);

      expect((response.body as OrderResponse).status).toBe(
        OrderStatus.REJECTED,
      );
    });

    it('does not sell shares already committed to a pending sell', async () => {
      const buy = { userId: USER_ID, instrumentId: PAMP_ID, side: 'BUY' };
      const sell = { userId: USER_ID, instrumentId: PAMP_ID, side: 'SELL' };
      await sendOrder({ ...buy, type: 'MARKET', size: 2 }).expect(201);
      await sendOrder({ ...sell, type: 'LIMIT', size: 2, price: 1000 }).expect(
        201,
      );

      const response = await sendOrder({
        ...sell,
        type: 'MARKET',
        size: 1,
      }).expect(201);

      expect((response.body as OrderResponse).status).toBe(
        OrderStatus.REJECTED,
      );
    });

    it('returns 400 and saves nothing when a LIMIT order has no price', async () => {
      await sendOrder({
        userId: USER_ID,
        instrumentId: PAMP_ID,
        side: 'BUY',
        type: 'LIMIT',
        size: 1,
      }).expect(400);

      expect(await countOrders()).toBe(1);
    });

    it('fills only one of several simultaneous buys the cash covers once', async () => {
      const buy = {
        userId: USER_ID,
        instrumentId: PAMP_ID,
        side: 'BUY',
        type: 'MARKET',
        size: 10,
      };

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => sendOrder(buy).expect(201)),
      );

      const statuses = responses.map(
        (response) => (response.body as OrderResponse).status,
      );
      expect(
        statuses.filter((status) => status === OrderStatus.FILLED),
      ).toHaveLength(1);
      expect(
        statuses.filter((status) => status === OrderStatus.REJECTED),
      ).toHaveLength(4);
      expect((await getPortfolio()).availableCash).toBe(741.5);
    });
  });

  describe('POST /orders/:id/cancel', () => {
    it('cancels a NEW order and releases the reserved cash', async () => {
      const created = await sendOrder({
        userId: USER_ID,
        instrumentId: PAMP_ID,
        side: 'BUY',
        type: 'LIMIT',
        size: 5,
        price: 900,
      }).expect(201);
      const orderId = (created.body as OrderResponse).id;

      const response = await cancelOrder(orderId).expect(200);

      expect((response.body as OrderResponse).status).toBe(
        OrderStatus.CANCELLED,
      );
      expect((await getPortfolio()).availableCash).toBe(INITIAL_CASH);
    });

    it('returns 409 when the order is not NEW', async () => {
      const created = await sendOrder({
        userId: USER_ID,
        instrumentId: PAMP_ID,
        side: 'BUY',
        type: 'MARKET',
        size: 1,
      }).expect(201);

      await cancelOrder((created.body as OrderResponse).id).expect(409);
    });
  });
});
