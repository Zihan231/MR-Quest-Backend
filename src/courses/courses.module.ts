import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AiTestingModule } from '../ai-testing/ai-testing.module';
import { NotificationsModule } from './notifications.module';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { Category } from './entities/category.entity';
import { Enrollment } from './entities/enrollment.entity';
import { Test } from './entities/test.entity';
import { Question } from './entities/question.entity';
import { TestSubmission } from './entities/test-submission.entity';
import { SubmissionAnswer } from './entities/submission-answer.entity';
import { User } from '../auth/entities/user.entity';
import { AiTestGenerationRequest } from '../ai-testing/entities/ai-test-generation-request.entity';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { TrashCleanupService } from './trash-cleanup.service';
import { TestsService } from './tests.service';
import { NotificationsController } from './notifications.controller';
import { ExamSchedulerService } from './exam-scheduler.service';
import { CqEvaluationService } from './cq-evaluation/cq-evaluation.service';

import { MediaProcessorService } from './media-processor.service';
// import { SpeechService } from './speech.service';
import { TestsController } from './tests.controller';
import { GeminiAnalysisService } from './gemini-analysis.service';
import { CloudStorageService } from './cloud-storage.service';
import { VideoEvaluationService } from './video-evaluation/video-evaluation.service';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      Lesson,
      Category,
      Enrollment,
      User,
      Test,
      Question,
      TestSubmission,
      SubmissionAnswer,
      AiTestGenerationRequest,
    ]),
    AuthModule,
    ConfigModule,
    AiTestingModule,
    NotificationsModule,
  ],
  controllers: [CoursesController, NotificationsController, TestsController],
  providers: [
    CoursesService,
    TrashCleanupService,
    TestsService,
    ExamSchedulerService,
    // SpeechService,
    MediaProcessorService,
    GeminiAnalysisService,
    CloudStorageService,
    VideoEvaluationService,
    CqEvaluationService,
  ],
  exports: [
    CoursesService,
    TestsService,
    NotificationsModule,
    GeminiAnalysisService,
    CloudStorageService,
    MediaProcessorService,
    VideoEvaluationService,
    CqEvaluationService,
  ],
})
export class CoursesModule {}
