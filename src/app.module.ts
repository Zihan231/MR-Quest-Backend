import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CoursesModule } from './courses/courses.module';
import { ExamGroupsModule } from './exam-groups/exam-groups.module';
import { AiTestingModule } from './ai-testing/ai-testing.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
import { CertificatesModule } from './certificates/certificates.module';

import { UploadsController } from './uploads.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: true, // Keep synchronize true for automatic table creation in development
      ssl: {
        rejectUnauthorized: false, // Required for Neon DB connection
      },
      extra: {
        max: 20, // Maximum number of connections in the pool
        idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
        connectionTimeoutMillis: 5000, // Connection timeout threshold
      },
    }),
    AuthModule,
    CoursesModule,
    ExamGroupsModule,
    AiTestingModule,
    ActivityLogsModule,
    CertificatesModule,
  ],
  controllers: [AppController, UploadsController],
  providers: [AppService],
})
export class AppModule {}
