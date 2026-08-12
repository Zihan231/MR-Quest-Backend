import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { User } from '../auth/entities/user.entity';
import { ExamGroup } from '../exam-groups/entities/exam-group.entity';
import { ExamGroupQuestion } from '../exam-groups/entities/exam-group-question.entity';
import { AiTestGenerationRequest } from './entities/ai-test-generation-request.entity';
import { AiGeneratedQuestion } from './entities/ai-generated-question.entity';
import { Notification } from '../notifications/notification.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { CreateAiTestDto } from './dto/create-ai-test.dto';
import { GeminiAiService } from './gemini-ai.service';

@Injectable()
export class AiTestingService {
  private readonly logger = new Logger(AiTestingService.name);

  constructor(
    @InjectRepository(AiTestGenerationRequest)
    private readonly requestRepo: Repository<AiTestGenerationRequest>,
    @InjectRepository(AiGeneratedQuestion)
    private readonly generatedQuestionRepo: Repository<AiGeneratedQuestion>,
    @InjectRepository(ExamGroup)
    private readonly examGroupRepo: Repository<ExamGroup>,
    @InjectRepository(ExamGroupQuestion)
    private readonly questionRepo: Repository<ExamGroupQuestion>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly geminiAiService: GeminiAiService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async createAiTest(dto: CreateAiTestDto, userId: string) {
    this.logger.log(
      `createAiTest request user=${userId} examGroupId=${dto.examGroupId} sourceDocumentUrl=${dto.sourceDocumentUrl} mcq=${dto.mcqCount} cq=${dto.cqCount} video=${dto.includeVideoTest}`,
    );
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      this.logger.warn(`createAiTest user not found userId=${userId}`);
      throw new NotFoundException('User not found');
    }

    const examGroup = await this.examGroupRepo.findOne({
      where: { id: dto.examGroupId },
    });
    if (!examGroup) {
      this.logger.warn(
        `createAiTest exam group not found examGroupId=${dto.examGroupId}`,
      );
      throw new NotFoundException('Exam group not found');
    }

    const generationRequest = this.requestRepo.create({
      requestId: this.generateRequestId(),
      examGroupId: dto.examGroupId,
      sourceDocumentUrl: dto.sourceDocumentUrl,
      sourceDocumentType: dto.sourceDocumentType || 'pdf',
      mcqCount: dto.mcqCount,
      cqCount: dto.cqCount,
      includeVideoTest: dto.includeVideoTest || false,
      status: 'pending',
      createdByUserId: userId,
    });

    await this.requestRepo.save(generationRequest);
    this.logger.log(
      `createAiTest saved request id=${generationRequest.id} requestId=${generationRequest.requestId}`,
    );

    const payload = {
      requestId: generationRequest.id,
      examGroupId: dto.examGroupId,
      sourceDocumentUrl: dto.sourceDocumentUrl,
      sourceDocumentType: dto.sourceDocumentType || 'pdf',
      mcqCount: dto.mcqCount,
      cqCount: dto.cqCount,
      includeVideoTest: dto.includeVideoTest || false,
      title: dto.title || undefined,
    };

    setImmediate(() => {
      this.processGenerationJob(payload).catch((err) => {
        this.logger.error(
          `Async AI generation failed requestId=${payload.requestId}: ${err.message}`,
        );
      });
    });

    return generationRequest;
  }

  async processGenerationJob(data: {
    requestId: number;
    examGroupId: number;
    sourceDocumentUrl: string;
    sourceDocumentType: string;
    mcqCount: number;
    cqCount: number;
    includeVideoTest?: boolean;
    title?: string;
  }) {
    this.logger.log(
      `processGenerationJob start requestId=${data.requestId} examGroupId=${data.examGroupId}`,
    );
    const generationRequest = await this.requestRepo.findOne({
      where: { id: data.requestId },
    });

    if (!generationRequest) {
      this.logger.warn(`Generation request ${data.requestId} not found`);
      return;
    }

    const examGroup = await this.examGroupRepo.findOne({
      where: { id: data.examGroupId },
    });
    if (!examGroup) {
      this.logger.warn(`Exam group ${data.examGroupId} not found`);
      generationRequest.status = 'failed';
      generationRequest.errorMessage = 'Exam group not found';
      await this.requestRepo.save(generationRequest);
      return;
    }

    generationRequest.status = 'processing';
    await this.requestRepo.save(generationRequest);
    this.logger.log(
      `processGenerationJob status=processing requestId=${data.requestId}`,
    );

    try {
      const fullPath = path.resolve(
        '.',
        data.sourceDocumentUrl.replace(/^[/\\]+/, ''),
      );
      this.logger.log(`processGenerationJob resolving path ${fullPath}`);

      if (!fs.existsSync(fullPath)) {
        const err = new Error(`Uploaded file not found at ${fullPath}`);
        this.logger.error(err.message);
        generationRequest.status = 'failed';
        generationRequest.errorMessage = err.message;
        await this.requestRepo.save(generationRequest);
        throw err;
      }

      this.logger.log(
        `processGenerationJob file exists size=${fs.statSync(fullPath).size}`,
      );
      const fileBuffer = fs.readFileSync(fullPath);
      const base64Data = fileBuffer.toString('base64');
      const fileMimeType =
        data.sourceDocumentType === 'pdf'
          ? 'application/pdf'
          : 'application/octet-stream';
      this.logger.log(
        `processGenerationJob file encoded size=${base64Data.length} mime=${fileMimeType}`,
      );

      const mcqQuestions = await this.geminiAiService.generateMcqs(
        '',
        data.mcqCount,
        { data: base64Data, mimeType: fileMimeType },
      );
      this.logger.log(`processGenerationJob got ${mcqQuestions.length} MCQs`);

      let cqQuestions: any[] = [];
      let referenceScript = '';
      if (data.cqCount > 0) {
        this.logger.log(
          `processGenerationJob generating ${data.cqCount} CQs for requestId=${data.requestId}`,
        );
        const cqResult = await this.geminiAiService.generateCqWithScript(
          '',
          data.cqCount,
          { data: base64Data, mimeType: fileMimeType },
        );
        cqQuestions = cqResult.questions;
        referenceScript = cqResult.referenceScript;
        this.logger.log(
          `processGenerationJob CQ done questions=${cqQuestions.length} scriptLength=${referenceScript?.length || 0}`,
        );
      }

      let videoTestScript = '';
      if (data.includeVideoTest) {
        this.logger.log(
          `processGenerationJob generating video script for requestId=${data.requestId}`,
        );
        videoTestScript = await this.geminiAiService.generateVideoScript('', {
          data: base64Data,
          mimeType: fileMimeType,
        });
        this.logger.log(
          `processGenerationJob video script length=${videoTestScript?.length || 0}`,
        );
      }

      const createdQuestions: ExamGroupQuestion[] = [];

      for (const mcq of mcqQuestions.slice(0, data.mcqCount)) {
        const question = this.questionRepo.create({
          questionText: mcq.questionText,
          type: 'MCQ',
          options: mcq.options,
          correctAnswers: mcq.correctAnswers,
          marks: 1,
          evaluationType: 'AI',
          examGroup,
        });
        createdQuestions.push(question);
      }

      for (const cq of cqQuestions.slice(0, data.cqCount)) {
        const question = this.questionRepo.create({
          questionText: cq.questionText,
          type: 'CQ',
          options: [],
          correctAnswers: cq.correctAnswers || [],
          marks: cq.marks || 2,
          referenceScript: referenceScript || undefined,
          evaluationType: 'AI',
          examGroup,
        });
        createdQuestions.push(question);
      }

      if (videoTestScript && data.includeVideoTest) {
        const videoQuestion = this.questionRepo.create({
          questionText: 'Record a video response based on the provided script',
          type: 'Video',
          options: [],
          correctAnswers: [],
          marks: 5,
          accuracyMarks: 5,
          referenceScript: videoTestScript,
          evaluationType: 'AI',
          examGroup,
        });
        createdQuestions.push(videoQuestion);
      }

      const savedQuestions = await this.questionRepo.save(createdQuestions);

      for (const q of savedQuestions) {
        await this.generatedQuestionRepo.save({
          examGroupQuestionId: q.id,
          generationRequestId: data.requestId,
          modelUsed: 'gemini-2.0-flash',
        });
      }

      generationRequest.status = 'completed';
      await this.requestRepo.save(generationRequest);

      // Notify the requesting user about the completed generation
      if (generationRequest.createdByUserId) {
        try {
          const requester = await this.userRepo.findOne({
            where: { userId: generationRequest.createdByUserId },
          });
          if (requester) {
            const notification = this.notificationRepo.create({
              message: `AI question generation for "${examGroup.title}" completed (${savedQuestions.length} questions added).`,
              user: requester,
              actionLink: `/dashboard/exam-groups/${examGroup.id}/manage`,
            });
            const savedNotif = await this.notificationRepo.save(notification);
            this.notificationsGateway.sendNotificationToUser(requester.userId, {
              id: savedNotif.id,
              message: savedNotif.message,
              actionLink: savedNotif.actionLink,
              createdAt: savedNotif.createdAt,
              isRead: false,
            });
          }
        } catch (err: any) {
          this.logger.error(
            `Failed to notify requester for AI generation ${data.requestId}: ${err?.message}`,
          );
        }
      }

      this.logger.log(`AI generation completed for request ${data.requestId}`);
      return savedQuestions;
    } catch (error) {
      this.logger.error(
        `AI test generation failed for request ${data.requestId}: ${error.message}`,
      );
      generationRequest.status = 'failed';
      generationRequest.errorMessage = error.message;
      await this.requestRepo.save(generationRequest);
      throw error;
    }
  }

  async getGenerationRequest(
    id: number,
    requesterUserId?: string,
    requesterRole?: string,
  ) {
    this.logger.log(`getGenerationRequest id=${id}`);
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      this.logger.warn(`Generation request ${id} not found`);
      throw new NotFoundException('Generation request not found');
    }

    if (
      request.createdByUserId &&
      request.createdByUserId !== requesterUserId &&
      requesterRole !== 'admin' &&
      requesterRole !== 'employee'
    ) {
      this.logger.warn(
        `getGenerationRequest id=${id} forbidden for ${requesterUserId}`,
      );
      throw new ForbiddenException(
        'You are not allowed to view this generation request.',
      );
    }

    this.logger.log(
      `getGenerationRequest id=${id} status=${request.status} errorMessage=${request.errorMessage || ''}`,
    );
    return request;
  }

  async getGenerationRequestsByExamGroup(examGroupId: number) {
    return this.requestRepo.find({
      where: { examGroupId },
      order: { createdAt: 'DESC' },
    });
  }

  private generateRequestId(): string {
    return `AIR-${Date.now().toString(36).toUpperCase()}`;
  }
}
