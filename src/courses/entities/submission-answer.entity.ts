import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { TestSubmission } from './test-submission.entity';
import { Question } from './question.entity';

@Entity('submission_answers')
export class SubmissionAnswer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'jsonb', nullable: true })
  providedAnswer: any; // Can be array of strings (MCQ) or string (CQ)

  @Column({ type: 'float', default: 0 })
  marksAwarded: number;

  @Column({ type: 'text', nullable: true })
  evaluatorComment: string;

  @Column({ nullable: true })
  evaluatedBy: string;

  @ManyToOne(() => TestSubmission, (submission) => submission.answers, {
    onDelete: 'CASCADE',
  })
  submission: TestSubmission;

  @ManyToOne(() => Question, (question) => question.answers, {
    onDelete: 'CASCADE',
  })
  question: Question;
}
