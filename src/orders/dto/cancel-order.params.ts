import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_POSTGRES_INT } from '../../common/limits';

export class CancelOrderParams {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_POSTGRES_INT)
  id!: number;
}
