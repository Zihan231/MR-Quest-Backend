import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Question } from '../../courses/entities/question.entity';
import { AiTestGenerationRequest } from './ai-test-generation-request.entity';

@Entity('ai_generated_questions')
export class AiGeneratedQuestion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  questionId: number;

  @Column()
  generationRequestId: number;

  @Column({ type: 'text', nullable: true })
  sourceContext: string | null;

  @Column({ nullable: true })
  modelUsed: string;
}
