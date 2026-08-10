import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Test } from '../../courses/entities/test.entity';

@Entity('ai_video_test_scripts')
export class AiVideoTestScript {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  testId: number;

  @Column({ type: 'text' })
  scriptText: string;

  @Column({ nullable: true })
  durationSeconds: number;

  @Column({ nullable: true })
  cloudStorageUrl: string;

  @CreateDateColumn()
  createdAt: Date;
}
