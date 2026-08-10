import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ExamGroup } from './exam-group.entity';

@Entity('exam_group_questions')
export class ExamGroupQuestion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  questionText: string;

  @Column({ default: 'MCQ' })
  type: string;

  @Column({ type: 'jsonb', nullable: true })
  options: string[];

  @Column({ type: 'jsonb', nullable: true })
  correctAnswers: string[];

  @Column({ type: 'float', default: 1 })
  marks: number;

  @Column({ type: 'float', nullable: true })
  postureMarks: number;

  @Column({ type: 'float', nullable: true })
  voiceMarks: number;

  @Column({ type: 'float', nullable: true })
  accuracyMarks: number;

  @Column({ default: 'AI' })
  evaluationType: string;

  @ManyToOne(() => ExamGroup, (examGroup) => examGroup.questions, {
    onDelete: 'CASCADE',
  })
  examGroup: ExamGroup;
}
