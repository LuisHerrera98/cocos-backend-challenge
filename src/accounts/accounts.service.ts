import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { toCents } from '../common/money';

export interface CashBalance {
  totalCents: number;
  availableCents: number;
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

// Pending sells are subtracted so the same shares cannot be sold twice.
const AVAILABLE_SHARES_QUERY = `
  SELECT
    COALESCE(
      SUM(
        CASE
          WHEN side = 'BUY' AND status = 'FILLED' THEN size
          WHEN side = 'SELL' AND status IN ('FILLED', 'NEW') THEN -size
          ELSE 0
        END
      ),
      0
    )::int AS available
  FROM orders
  WHERE userid = $1 AND instrumentid = $2
`;

@Injectable()
export class AccountsService {
  // The balance is not stored in a row, so the user row is locked instead.
  async lockUser(manager: EntityManager, userId: number): Promise<void> {
    const users = await manager.query<unknown[]>(
      'SELECT id FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (users.length === 0) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  async findCash(manager: EntityManager, userId: number): Promise<CashBalance> {
    const [cash] = await manager.query<{ balance: string; reserved: string }[]>(
      CASH_QUERY,
      [userId],
    );
    const totalCents = toCents(cash.balance);
    return {
      totalCents,
      availableCents: totalCents - toCents(cash.reserved),
    };
  }

  async findAvailableShares(
    manager: EntityManager,
    userId: number,
    instrumentId: number,
  ): Promise<number> {
    const [shares] = await manager.query<{ available: number }[]>(
      AVAILABLE_SHARES_QUERY,
      [userId, instrumentId],
    );
    return shares.available;
  }
}
