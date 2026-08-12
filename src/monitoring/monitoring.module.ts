import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { ExamGroup } from '../exam-groups/entities/exam-group.entity';
import { ExamGroupSubmission } from '../exam-groups/entities/exam-group-submission.entity';
import { ExamGroupQuestion } from '../exam-groups/entities/exam-group-question.entity';
import { ExamGroupEnrollment } from '../exam-groups/entities/exam-group-enrollment.entity';
import { ExamGroupAnswer } from '../exam-groups/entities/exam-group-answer.entity';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      ExamGroup,
      ExamGroupSubmission,
      ExamGroupQuestion,
      ExamGroupEnrollment,
      ExamGroupAnswer,
    ]),
    AuthModule,
  ],
  controllers: [MonitoringController],
  providers: [MonitoringService],
})
export class MonitoringModule {}
