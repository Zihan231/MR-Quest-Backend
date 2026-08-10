import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('activity_logs')
@Index(['action'])
@Index(['targetType'])
@Index(['targetId'])
@Index(['courseId'])
@Index(['createdAt'])
@Index(['actorId'])
export class ActivityLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  actorId: string;

  @Column()
  actorName: string;

  @Column()
  actorRole: string;

  @Column()
  action: string;

  @Column({ nullable: true })
  targetType: string;

  @Column({ nullable: true })
  targetName: string;

  @Column({ nullable: true })
  targetId: string;

  @Column({ nullable: true })
  courseId: string;

  @Column({ type: 'jsonb', nullable: true })
  details: any;

  @CreateDateColumn()
  createdAt: Date;
}
