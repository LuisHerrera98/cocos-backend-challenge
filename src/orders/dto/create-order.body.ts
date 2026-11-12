import {
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsPositive,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_POSTGRES_INT, MAX_PRICE } from '../../common/limits';
import { OrderSide } from '../order-side.enum';
import { OrderType } from '../order-type.enum';

// Keeps amounts in cents inside the safe integer range.
const MAX_AMOUNT = 1_000_000_000_000;

// Unlike @IsOptional, this does not let an explicit null through.
const isPresent = (_: object, value: unknown): boolean => value !== undefined;

export class CreateOrderBody {
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  userId!: number;

  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  instrumentId!: number;

  // Cash transfers are not sent through this endpoint.
  @IsIn([OrderSide.BUY, OrderSide.SELL])
  side!: OrderSide.BUY | OrderSide.SELL;

  @IsEnum(OrderType)
  type!: OrderType;

  @ValidateIf(isPresent)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  size?: number;

  @ValidateIf(isPresent)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_AMOUNT)
  amount?: number;

  @ValidateIf(isPresent)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_PRICE)
  price?: number;
}
