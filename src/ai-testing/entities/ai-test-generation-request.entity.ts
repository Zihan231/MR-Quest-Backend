import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Lesson } from '../../courses/entities/lesson.entity';
import { Test } from '../../courses/entities/test.entity';

@Entity('ai_test_generation_requests')
export class AiTestGenerationRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  requestId: string;

  @Column()
  lessonId: number;

  @Column({ nullable: true })
  testId: number;

  @Column()
  sourceDocumentUrl: string;

  @Column()
  sourceDocumentType: string;

  @Column()
  mcqCount: number;

  @Column()
  cqCount: number;

  @Column({ default: false })
  includeVideoTest: boolean;

  @Column({ default: 'pending' })
  status: string;

  @Column({ default: false })
  isPractice: boolean;

  @Column({ nullable: true })
  createdByUserId: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
