import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExamGroupQuestion } from './exam-group-question.entity';
import { ExamGroupEnrollment } from './exam-group-enrollment.entity';
import { ExamGroupSubmission } from './exam-group-submission.entity';

@Entity('exam_groups')
export class ExamGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  examGroupId: string;

  @Index()
  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  thumbnailUrl: string | null;

  @Index()
  @Column({ default: 'draft' })
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  startTime: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  endTime: Date | null;

  @Column({ type: 'integer', nullable: true })
  timePerQuestion: number | null;

  @Column({ default: 0 })
  totalStudents: number;

  @OneToMany(() => ExamGroupQuestion, (q) => q.examGroup, { cascade: true })
  questions: ExamGroupQuestion[];

  @OneToMany(() => ExamGroupEnrollment, (e) => e.examGroup, { cascade: true })
  enrollments: ExamGroupEnrollment[];

  @OneToMany(() => ExamGroupSubmission, (s) => s.examGroup)
  submissions: ExamGroupSubmission[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
