import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Test } from './test.entity';
import { SubmissionAnswer } from './submission-answer.entity';

@Entity('test_submissions')
export class TestSubmission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: true })
  isDraft: boolean;

  @Column({ type: 'float', default: 0 })
  marksObtained: number;

  @Column({ default: 'Pending Evaluation' })
  status: string; // 'Pending Evaluation' | 'Evaluated'

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Test, (test) => test.submissions, { onDelete: 'CASCADE' })
  test: Test;

  @OneToMany(() => SubmissionAnswer, (answer) => answer.submission, {
    cascade: true,
  })
  answers: SubmissionAnswer[];

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
