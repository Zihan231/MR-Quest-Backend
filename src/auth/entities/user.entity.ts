import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Enrollment } from '../../courses/entities/enrollment.entity';
import { Notification } from '../../courses/entities/notification.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Index()
  @Column()
  name: string;

  @Column({ select: false })
  password: string;

  @Column({ unique: true })
  userId: string; // e.g. 'TX-0001'

  @Column({ nullable: true })
  profilePictureUrl: string;

  @Index()
  @Column({ default: 'user' })
  role: string; // 'user' | 'employee' | 'admin'

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  address: string;

  @OneToMany(() => Enrollment, (enrollment) => enrollment.user)
  enrollments: Enrollment[];

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
