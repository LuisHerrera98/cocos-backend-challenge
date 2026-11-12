import { Instrument } from '../instrument.entity';
import { InstrumentType } from '../instrument-type.enum';

export class InstrumentResponse {
  id!: number;
  ticker!: string;
  name!: string;
  type!: InstrumentType;

  static fromEntity(instrument: Instrument): InstrumentResponse {
    const response = new InstrumentResponse();
    response.id = instrument.id;
    response.ticker = instrument.ticker;
    response.name = instrument.name;
    response.type = instrument.type;
    return response;
  }
}
