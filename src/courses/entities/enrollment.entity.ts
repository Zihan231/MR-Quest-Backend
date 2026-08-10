import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Course } from './course.entity';
import { Lesson } from './lesson.entity';

@Entity('enrollments')
export class Enrollment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.enrollments, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Course, (course) => course.enrollments, {
    onDelete: 'CASCADE',
  })
  course: Course;

  @ManyToMany(() => Lesson, { eager: true })
  @JoinTable({
    name: 'enrollment_completed_lessons', // Custom join table name
  })
  completedLessons: Lesson[];

  @Column({ type: 'float', default: 0 })
  progress: number; // progress percentage, e.g. 50.0

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
