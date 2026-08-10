import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { ExamGroup } from './entities/exam-group.entity';
import { ExamGroupQuestion } from './entities/exam-group-question.entity';
import { ExamGroupEnrollment } from './entities/exam-group-enrollment.entity';
import { ExamGroupSubmission } from './entities/exam-group-submission.entity';
import { ExamGroupAnswer } from './entities/exam-group-answer.entity';
import { User } from '../auth/entities/user.entity';
import { ExamGroupsService } from './exam-groups.service';
import { ExamGroupsController } from './exam-groups.controller';

import { CoursesModule } from '../courses/courses.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExamGroup,
      ExamGroupQuestion,
      ExamGroupEnrollment,
      ExamGroupSubmission,
      ExamGroupAnswer,
      User,
    ]),
    AuthModule,
    ConfigModule,
    CoursesModule,
  ],
  controllers: [ExamGroupsController],
  providers: [ExamGroupsService],
  exports: [ExamGroupsService],
})
export class ExamGroupsModule {}
