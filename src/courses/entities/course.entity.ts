import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { Category } from './category.entity';
import { Lesson } from './lesson.entity';
import { Enrollment } from './enrollment.entity';
import { Test } from './test.entity';

@Entity('courses')
export class Course {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  name: string;

  @Column({ unique: true })
  courseId: string; // e.g. 'TS-101'

  @Column({ default: 0 })
  enrolled: number;

  @Index()
  @Column({ default: 'draft' })
  status: string; // 'active' | 'inactive' | 'draft'

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ nullable: true })
  thumbnailUrl: string;

  @ManyToOne(() => Category, (category) => category.courses, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  category: Category | null;

  @OneToMany(() => Lesson, (lesson) => lesson.course, { cascade: true })
  lessons: Lesson[];

  @OneToMany(() => Enrollment, (enrollment) => enrollment.course)
  enrollments: Enrollment[];

  @OneToMany(() => Test, (test) => test.course)
  tests: Test[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;

  // This will be populated dynamically by the service
  completionRate?: number;
}
