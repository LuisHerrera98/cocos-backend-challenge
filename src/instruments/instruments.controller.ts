import { Controller, Get, Query } from '@nestjs/common';
import { InstrumentResponse } from './dto/instrument.response';
import { SearchInstrumentsQuery } from './dto/search-instruments.query';
import { InstrumentsService } from './instruments.service';

@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Get()
  async search(
    @Query() query: SearchInstrumentsQuery,
  ): Promise<InstrumentResponse[]> {
    const instruments = await this.instrumentsService.search(query.q);
    return instruments.map((instrument) =>
      InstrumentResponse.fromEntity(instrument),
    );
  }
}
