import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class SearchInstrumentsQuery {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  // Postgres rejects NUL bytes in text values, which surfaced as a 500.
  @Matches(/^\P{Cc}*$/u, {
    message: 'q must not contain control characters',
  })
  q!: string;
}
