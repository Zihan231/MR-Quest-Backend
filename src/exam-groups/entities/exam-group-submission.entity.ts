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
import { ExamGroup } from './exam-group.entity';
import { ExamGroupAnswer } from './exam-group-answer.entity';

@Entity('exam_group_submissions')
export class ExamGroupSubmission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'float', default: 0 })
  marksObtained: number;

  @Column({ default: 'Evaluated' })
  status: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => ExamGroup, (examGroup) => examGroup.submissions, {
    onDelete: 'CASCADE',
  })
  examGroup: ExamGroup;

  @OneToMany(() => ExamGroupAnswer, (answer) => answer.submission, {
    cascade: true,
  })
  answers: ExamGroupAnswer[];

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
