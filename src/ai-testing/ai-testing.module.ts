import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiTestingService } from './ai-testing.service';
import { AiTestsController } from './ai-tests.controller';
import { AiTestGenerationRequest } from './entities/ai-test-generation-request.entity';
import { AiGeneratedQuestion } from './entities/ai-generated-question.entity';
import { User } from '../auth/entities/user.entity';
import { ExamGroup } from '../exam-groups/entities/exam-group.entity';
import { ExamGroupQuestion } from '../exam-groups/entities/exam-group-question.entity';
import { DocumentParserService } from './document-parser.service';
import { GeminiAiService } from './gemini-ai.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiTestGenerationRequest,
      AiGeneratedQuestion,
      User,
      ExamGroup,
      ExamGroupQuestion,
    ]),
    AuthModule,
    NotificationsModule,
  ],
  controllers: [AiTestsController],
  providers: [AiTestingService, DocumentParserService, GeminiAiService],
  exports: [AiTestingService, GeminiAiService],
})
export class AiTestingModule {}
