import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { District } from './district.entity';

@Entity('upazilas')
@Index(['districtId', 'name'], { unique: true })
export class Upazila {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  districtId: number;

  @ManyToOne(() => District, (district) => district.upazilas, {
    onDelete: 'CASCADE',
  })
  district: District;
}