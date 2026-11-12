export class PositionResponse {
  instrumentId!: number;
  ticker!: string;
  name!: string;
  quantity!: number;
  // null when the instrument has no market data
  lastPrice!: number | null;
  marketValue!: number | null;
  totalReturnPercent!: number | null;
  dailyReturnPercent!: number | null;
}

export class PortfolioResponse {
  userId!: number;
  totalValue!: number;
  availableCash!: number;
  positions!: PositionResponse[];
}
