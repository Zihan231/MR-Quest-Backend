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
import { Course } from './course.entity';
import { Test } from './test.entity';

@Entity('lessons')
export class Lesson {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  title: string;

  @Column({ unique: true })
  lessonId: string; // e.g. 'L-TS-01'

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column()
  materialType: string; // 'Video' | 'PDF' | 'PPT'

  @Column()
  materialLink: string;

  @Column({ default: 'Draft' })
  status: string; // 'Active' | 'Draft'

  @Column({ default: false })
  practiceEnabled: boolean;

  @ManyToOne(() => Course, (course) => course.lessons, { onDelete: 'CASCADE' })
  course: Course;

  @OneToMany(() => Test, (test) => test.lesson)
  tests: Test[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
