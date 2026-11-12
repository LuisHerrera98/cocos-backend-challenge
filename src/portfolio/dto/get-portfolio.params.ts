import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

// users.id is a Postgres INT; a bigger value makes the query fail.
const MAX_POSTGRES_INT = 2147483647;

export class GetPortfolioParams {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  id!: number;
}
