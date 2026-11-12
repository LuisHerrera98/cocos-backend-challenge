import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Instrument } from './instrument.entity';
import { InstrumentType } from './instrument-type.enum';

const SEARCH_LIMIT = 20;

@Injectable()
export class InstrumentsService {
  constructor(
    @InjectRepository(Instrument)
    private readonly instrumentsRepository: Repository<Instrument>,
  ) {}

  async search(term: string): Promise<Instrument[]> {
    const escaped = this.escapeLikePattern(term);

    return await this.instrumentsRepository
      .createQueryBuilder('instrument')
      .where('instrument.type <> :cashType', { cashType: InstrumentType.CASH })
      .andWhere(
        new Brackets((qb) => {
          qb.where('instrument.ticker ILIKE :contains').orWhere(
            'instrument.name ILIKE :contains',
          );
        }),
      )
      .orderBy(
        `CASE
           WHEN UPPER(instrument.ticker) = UPPER(:term) THEN 0
           WHEN instrument.ticker ILIKE :startsWith THEN 1
           WHEN instrument.name ILIKE :startsWith THEN 2
           ELSE 3
         END`,
      )
      .addOrderBy('instrument.ticker', 'ASC')
      // ticker has no unique constraint, so id keeps the order deterministic.
      .addOrderBy('instrument.id', 'ASC')
      .setParameters({
        term,
        contains: `%${escaped}%`,
        startsWith: `${escaped}%`,
      })
      .limit(SEARCH_LIMIT)
      .getMany();
  }

  // Without this, searching "%" or "_" would match every instrument.
  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
  }
}
