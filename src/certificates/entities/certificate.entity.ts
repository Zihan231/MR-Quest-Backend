import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('certificates')
export class Certificate {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ unique: true })
  certificateId: string; // e.g. 'CERT-0001'

  @Index()
  @Column()
  userId: string;

  @Column()
  userName: string;

  @Index()
  @Column()
  courseId: string;

  @Column()
  courseName: string;

  @Index()
  @Column({ default: 'pending' })
  status: string; // 'pending' | 'issued' | 'rejected'

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  appliedAt: Date;

  @Column({ nullable: true })
  verifiedById: string;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  issuedAt: Date;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ nullable: true })
  certificateUrl: string; // e.g. '/uploads/certificates/CERT-0001.pdf'

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
