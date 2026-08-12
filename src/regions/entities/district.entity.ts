import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { Division } from './division.entity';
import { Upazila } from './upazila.entity';

@Entity('districts')
@Index(['divisionId', 'name'], { unique: true })
export class District {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  divisionId: number;

  @ManyToOne(() => Division, (division) => division.districts, {
    onDelete: 'CASCADE',
  })
  division: Division;

  @OneToMany(() => Upazila, (upazila) => upazila.district, {
    cascade: true,
  })
  upazilas: Upazila[];
}