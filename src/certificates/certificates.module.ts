import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Certificate } from './entities/certificate.entity';
import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { CoursesModule } from '../courses/courses.module';
import { User } from '../auth/entities/user.entity';
import { Course } from '../courses/entities/course.entity';
import { Test } from '../courses/entities/test.entity';
import { TestSubmission } from '../courses/entities/test-submission.entity';
import { Notification } from '../courses/entities/notification.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Certificate,
      User,
      Course,
      Test,
      TestSubmission,
      Notification,
      Enrollment,
    ]),
    CoursesModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
