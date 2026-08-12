import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExamGroup } from '../../exam-groups/entities/exam-group.entity';

@Entity('ai_test_generation_requests')
export class AiTestGenerationRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  requestId: string;

  @ManyToOne(() => ExamGroup, (examGroup) => examGroup.id, {
    onDelete: 'CASCADE',
  })
  examGroup: ExamGroup;

  @Column()
  examGroupId: number;

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

  @Column({ nullable: true })
  createdByUserId: string;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
