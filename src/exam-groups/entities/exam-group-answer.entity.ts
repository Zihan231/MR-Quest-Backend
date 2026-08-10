import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ExamGroupSubmission } from './exam-group-submission.entity';
import { ExamGroupQuestion } from './exam-group-question.entity';

@Entity('exam_group_answers')
export class ExamGroupAnswer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'jsonb', nullable: true })
  providedAnswer: string[] | null;

  @Column({ type: 'float', default: 0 })
  marksAwarded: number;

  @Column({ type: 'text', nullable: true })
  evaluatorComment: string;

  @Column({ type: 'varchar', nullable: true })
  evaluatedBy: string;

  @ManyToOne(() => ExamGroupSubmission, (submission) => submission.answers, {
    onDelete: 'CASCADE',
  })
  submission: ExamGroupSubmission;

  @ManyToOne(() => ExamGroupQuestion, (question) => question.id, {
    onDelete: 'CASCADE',
  })
  question: ExamGroupQuestion;
}
