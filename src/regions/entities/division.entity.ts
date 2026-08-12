import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Index,
} from 'typeorm';
import { District } from './district.entity';

@Entity('divisions')
export class Division {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ unique: true })
  name: string;

  @OneToMany(() => District, (district) => district.division, {
    cascade: true,
  })
  districts: District[];
}