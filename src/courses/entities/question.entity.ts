import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Test } from './test.entity';
import { SubmissionAnswer } from './submission-answer.entity';

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  questionText: string;

  // 'MCQ' or 'CQ'
  @Column()
  type: string;

  // JSON stringified array of strings for multiple choices
  @Column({ type: 'jsonb', nullable: true })
  options: string[];

  // JSON stringified array of correct option strings for auto evaluation
  @Column({ type: 'jsonb', nullable: true })
  correctAnswers: string[];

  @Column({ type: 'float', default: 0 })
  marks: number;

  @Column({ type: 'float', nullable: true })
  postureMarks: number;

  @Column({ type: 'float', nullable: true })
  voiceMarks: number;

  @Column({ type: 'float', nullable: true })
  accuracyMarks: number;

  @Column({ default: 'AI' })
  evaluationType: string;

  @Column({ type: 'text', nullable: true })
  referenceScript?: string;

  @ManyToOne(() => Test, (test) => test.questions, { onDelete: 'CASCADE' })
  test: Test;

  @OneToMany(() => SubmissionAnswer, (answer) => answer.question)
  answers: SubmissionAnswer[];
}
