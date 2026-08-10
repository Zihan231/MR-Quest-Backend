import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { ExamGroup } from './exam-group.entity';

@Entity('exam_group_enrollments')
export class ExamGroupEnrollment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => ExamGroup, (examGroup) => examGroup.enrollments, {
    onDelete: 'CASCADE',
  })
  examGroup: ExamGroup;

  @CreateDateColumn()
  createdAt: Date;
}
