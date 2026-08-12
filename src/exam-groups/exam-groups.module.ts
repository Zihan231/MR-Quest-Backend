import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AiEvaluationModule } from '../ai-evaluation/ai-evaluation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExamGroup } from './entities/exam-group.entity';
import { ExamGroupQuestion } from './entities/exam-group-question.entity';
import { ExamGroupEnrollment } from './entities/exam-group-enrollment.entity';
import { ExamGroupSubmission } from './entities/exam-group-submission.entity';
import { ExamGroupAnswer } from './entities/exam-group-answer.entity';
import { User } from '../auth/entities/user.entity';
import { Notification } from '../notifications/notification.entity';
import { ExamGroupsService } from './exam-groups.service';
import { ExamGroupsController } from './exam-groups.controller';
import { TrashCleanupService } from './trash-cleanup.service';
import { GeminiAiService } from '../ai-testing/gemini-ai.service';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExamGroup,
      ExamGroupQuestion,
      ExamGroupEnrollment,
      ExamGroupSubmission,
      ExamGroupAnswer,
      User,
      Notification,
    ]),
    AuthModule,
    ConfigModule,
    AiEvaluationModule,
    NotificationsModule,
    ActivityLogsModule,
  ],
  controllers: [ExamGroupsController],
  providers: [ExamGroupsService, TrashCleanupService, GeminiAiService],
  exports: [ExamGroupsService],
})
export class ExamGroupsModule {}
