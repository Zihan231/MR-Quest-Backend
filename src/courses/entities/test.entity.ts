import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Course } from './course.entity';
import { Lesson } from './lesson.entity';
import { Question } from './question.entity';
import { TestSubmission } from './test-submission.entity';

@Entity('tests')
export class Test {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // 'Lesson' or 'Course'
  @Column({ default: 'Lesson' })
  testType: string;

  @Column({ type: 'text', nullable: true })
  referenceScript?: string;

  @Column({ type: 'timestamp', nullable: true })
  startTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  endTime: Date;

  @ManyToOne(() => Course, (course) => course.tests, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  course: Course;

  @ManyToOne(() => Lesson, (lesson) => lesson.tests, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  lesson: Lesson;

  @OneToMany(() => Question, (question) => question.test, { cascade: true })
  questions: Question[];

  @OneToMany(() => TestSubmission, (submission) => submission.test)
  submissions: TestSubmission[];

  @Column({ default: 'published' })
  status: string; // 'published' | 'scheduled' | 'active' | 'completed' | 'cancelled'

  @Column({ nullable: true })
  videoTestScriptId: number;

  @Column({ nullable: true })
  createdByUserId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
