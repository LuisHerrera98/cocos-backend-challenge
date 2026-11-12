import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PortfolioResponse, PositionResponse } from './dto/portfolio.response';

interface CashRow {
  balance: string;
  reserved: string;
}

interface PositionRow {
  instrument_id: number;
  ticker: string;
  name: string;
  quantity: number;
  last_price: string | null;
  market_value: string | null;
  total_return_percent: string | null;
  daily_return_percent: string | null;
}

// For cash transfers the amount is in size.
const CASH_QUERY = `
  SELECT
    COALESCE(
      SUM(
        CASE side
          WHEN 'CASH_IN' THEN size
          WHEN 'CASH_OUT' THEN -size
          WHEN 'SELL' THEN size * price
          WHEN 'BUY' THEN -size * price
        END
      ) FILTER (WHERE status = 'FILLED'),
      0
    ) AS balance,
    COALESCE(
      SUM(size * price) FILTER (WHERE status = 'NEW' AND side = 'BUY'),
      0
    ) AS reserved
  FROM orders
  WHERE userid = $1
`;

// Only positive holdings: the seed data oversells BMA.
const POSITIONS_QUERY = `
  WITH latest_prices AS (
    SELECT DISTINCT ON (instrumentid) instrumentid, close, previousclose
    FROM marketdata
    ORDER BY instrumentid, date DESC
  ),
  holdings AS (
    SELECT
      instrumentid,
      SUM(CASE side WHEN 'BUY' THEN size ELSE -size END)::int AS quantity,
      SUM(size * price) FILTER (WHERE side = 'BUY')
        / NULLIF(SUM(size) FILTER (WHERE side = 'BUY'), 0) AS average_cost
    FROM orders
    WHERE userid = $1
      AND status = 'FILLED'
      AND side IN ('BUY', 'SELL')
    GROUP BY instrumentid
  )
  SELECT
    i.id AS instrument_id,
    i.ticker,
    i.name,
    h.quantity,
    p.close AS last_price,
    h.quantity * p.close AS market_value,
    ROUND(
      (p.close - h.average_cost) / NULLIF(h.average_cost, 0) * 100,
      2
    ) AS total_return_percent,
    ROUND(
      (p.close - p.previousclose) / NULLIF(p.previousclose, 0) * 100,
      2
    ) AS daily_return_percent
  FROM holdings h
  JOIN instruments i ON i.id = h.instrumentid
  LEFT JOIN latest_prices p ON p.instrumentid = h.instrumentid
  WHERE h.quantity > 0
  ORDER BY i.ticker, i.id
`;

// Money is added in cents to avoid float rounding errors.
const toCents = (amount: string): number => Math.round(Number(amount) * 100);
const fromCents = (cents: number): number => cents / 100;
const toNumber = (value: string | null): number | null =>
  value === null ? null : Number(value);

@Injectable()
export class PortfolioService {
  constructor(private readonly dataSource: DataSource) {}

  async getPortfolio(userId: number): Promise<PortfolioResponse> {
    // Both reads must see the same snapshot.
    const { cash, positions } = await this.dataSource.transaction(
      'REPEATABLE READ',
      async (manager) => {
        await this.assertUserExists(manager, userId);
        return {
          cash: await this.findCash(manager, userId),
          positions: await this.findPositions(manager, userId),
        };
      },
    );

    const balanceCents = toCents(cash.balance);
    const positionsCents = positions.reduce(
      (total, position) => total + toCents(position.market_value ?? '0'),
      0,
    );

    return {
      userId,
      // Reserved cash still counts towards the total.
      totalValue: fromCents(balanceCents + positionsCents),
      availableCash: fromCents(balanceCents - toCents(cash.reserved)),
      positions: positions.map((position) => this.toPositionResponse(position)),
    };
  }

  private async assertUserExists(
    manager: EntityManager,
    userId: number,
  ): Promise<void> {
    const users = await manager.query<unknown[]>(
      'SELECT 1 FROM users WHERE id = $1',
      [userId],
    );
    if (users.length === 0) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  private async findCash(
    manager: EntityManager,
    userId: number,
  ): Promise<CashRow> {
    const [cash] = await manager.query<CashRow[]>(CASH_QUERY, [userId]);
    return cash;
  }

  private findPositions(
    manager: EntityManager,
    userId: number,
  ): Promise<PositionRow[]> {
    return manager.query<PositionRow[]>(POSITIONS_QUERY, [userId]);
  }

  private toPositionResponse(position: PositionRow): PositionResponse {
    return {
      instrumentId: position.instrument_id,
      ticker: position.ticker,
      name: position.name,
      quantity: position.quantity,
      lastPrice: toNumber(position.last_price),
      marketValue: toNumber(position.market_value),
      totalReturnPercent: toNumber(position.total_return_percent),
      dailyReturnPercent: toNumber(position.daily_return_percent),
    };
  }
}
