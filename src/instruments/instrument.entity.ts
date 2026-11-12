import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { InstrumentType } from './instrument-type.enum';

@Entity('instruments')
export class Instrument {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 10 })
  ticker!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 10 })
  type!: InstrumentType;
}
