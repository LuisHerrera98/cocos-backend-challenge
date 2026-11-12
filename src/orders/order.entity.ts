import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { OrderSide } from './order-side.enum';
import { OrderStatus } from './order-status.enum';
import { OrderType } from './order-type.enum';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  // database.sql creates the columns unquoted, so Postgres lowercases them.
  @Column({ name: 'instrumentid', type: 'int' })
  instrumentId!: number;

  @Column({ name: 'userid', type: 'int' })
  userId!: number;

  @Column({ type: 'int' })
  size!: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    // pg returns NUMERIC as a string.
    transformer: { to: (value: number) => value, from: Number },
  })
  price!: number;

  @Column({ type: 'varchar', length: 10 })
  type!: OrderType;

  @Column({ type: 'varchar', length: 10 })
  side!: OrderSide;

  @Column({ type: 'varchar', length: 20 })
  status!: OrderStatus;

  @Column({ type: 'timestamp' })
  datetime!: Date;
}
