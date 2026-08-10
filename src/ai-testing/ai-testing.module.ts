import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiTestingService } from './ai-testing.service';
import { AiTestsController } from './ai-tests.controller';
import { AiTestGenerationRequest } from './entities/ai-test-generation-request.entity';
import { AiVideoTestScript } from './entities/ai-video-test-script.entity';
import { AiGeneratedQuestion } from './entities/ai-generated-question.entity';
import { Test } from '../courses/entities/test.entity';
import { Question } from '../courses/entities/question.entity';
import { Lesson } from '../courses/entities/lesson.entity';
import { User } from '../auth/entities/user.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';
import { Course } from '../courses/entities/course.entity';
import { DocumentParserService } from './document-parser.service';
import { GeminiAiService } from './gemini-ai.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../courses/notifications.module';
import { Notification } from '../courses/entities/notification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiTestGenerationRequest,
      AiVideoTestScript,
      AiGeneratedQuestion,
      Test,
      Question,
      Lesson,
      User,
      Enrollment,
      Course,
      Notification,
    ]),
    AuthModule,
    NotificationsModule,
  ],
  controllers: [AiTestsController],
  providers: [
    AiTestingService,
    DocumentParserService,
    GeminiAiService,
  ],
  exports: [AiTestingService, GeminiAiService],
})
export class AiTestingModule {}
