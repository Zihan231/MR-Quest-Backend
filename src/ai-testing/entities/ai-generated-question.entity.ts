import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { ExamGroupQuestion } from '../../exam-groups/entities/exam-group-question.entity';
import { AiTestGenerationRequest } from './ai-test-generation-request.entity';

@Entity('ai_generated_questions')
export class AiGeneratedQuestion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  examGroupQuestionId: number;

  @Column()
  generationRequestId: number;

  @Column({ type: 'text', nullable: true })
  sourceContext: string | null;

  @Column({ nullable: true })
  modelUsed: string;
}
