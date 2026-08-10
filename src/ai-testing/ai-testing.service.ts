import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Test } from '../courses/entities/test.entity';
import { Question } from '../courses/entities/question.entity';
import { Lesson } from '../courses/entities/lesson.entity';
import { User } from '../auth/entities/user.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';
import { Course } from '../courses/entities/course.entity';
import { AiTestGenerationRequest } from './entities/ai-test-generation-request.entity';
import { AiVideoTestScript } from './entities/ai-video-test-script.entity';
import { AiGeneratedQuestion } from './entities/ai-generated-question.entity';
import { Notification } from '../courses/entities/notification.entity';
import { NotificationsGateway } from '../courses/notifications.gateway';
import { CreateAiTestDto } from './dto/create-ai-test.dto';
import { CreatePracticeTestDto } from './dto/create-practice-test.dto';
import { GeminiAiService } from './gemini-ai.service';

@Injectable()
export class AiTestingService {
  private readonly logger = new Logger(AiTestingService.name);

  constructor(
    @InjectRepository(Test) private readonly testRepo: Repository<Test>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(AiTestGenerationRequest)
    private readonly requestRepo: Repository<AiTestGenerationRequest>,
    @InjectRepository(AiVideoTestScript)
    private readonly scriptRepo: Repository<AiVideoTestScript>,
    @InjectRepository(AiGeneratedQuestion)
    private readonly generatedQuestionRepo: Repository<AiGeneratedQuestion>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly geminiAiService: GeminiAiService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async createAiTest(dto: CreateAiTestDto, userId: string) {
    this.logger.log(`createAiTest request user=${userId} lessonId=${dto.lessonId} sourceDocumentUrl=${dto.sourceDocumentUrl} mcq=${dto.mcqCount} cq=${dto.cqCount} video=${dto.includeVideoTest}`);
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      this.logger.warn(`createAiTest user not found userId=${userId}`);
      throw new NotFoundException('User not found');
    }

    const lesson = await this.lessonRepo.findOne({
      where: { id: dto.lessonId },
    });
    if (!lesson) {
      this.logger.warn(`createAiTest lesson not found lessonId=${dto.lessonId}`);
      throw new NotFoundException('Lesson not found');
    }

    const generationRequest = this.requestRepo.create({
      requestId: this.generateRequestId(),
      lessonId: dto.lessonId,
      sourceDocumentUrl: dto.sourceDocumentUrl,
      sourceDocumentType: dto.sourceDocumentType || 'pdf',
      mcqCount: dto.mcqCount,
      cqCount: dto.cqCount,
      includeVideoTest: dto.includeVideoTest || false,
      status: 'pending',
    });

    await this.requestRepo.save(generationRequest);
    this.logger.log(`createAiTest saved request id=${generationRequest.id} requestId=${generationRequest.requestId}`);

    const payload = {
      requestId: generationRequest.id,
      lessonId: dto.lessonId,
      sourceDocumentUrl: dto.sourceDocumentUrl,
      sourceDocumentType: dto.sourceDocumentType || 'pdf',
      mcqCount: dto.mcqCount,
      cqCount: dto.cqCount,
      includeVideoTest: dto.includeVideoTest || false,
      title: dto.title || undefined,
    };

    setImmediate(() => {
      this.processGenerationJob(payload).catch((err) => {
        this.logger.error(`Async AI generation failed requestId=${payload.requestId}: ${err.message}`);
      });
    });

    return generationRequest;
  }

  async createPracticeTest(dto: CreatePracticeTestDto, userId: string) {
    this.logger.log(`createPracticeTest request user=${userId} lessonId=${dto.lessonId} mcq=${dto.mcqCount} cq=${dto.cqCount} video=${dto.includeVideoTest}`);
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      this.logger.warn(`createPracticeTest user not found userId=${userId}`);
      throw new NotFoundException('User not found');
    }

    const lesson = await this.lessonRepo.findOne({
      where: { id: dto.lessonId },
      relations: { course: true },
    });
    if (!lesson) {
      this.logger.warn(`createPracticeTest lesson not found lessonId=${dto.lessonId}`);
      throw new NotFoundException('Lesson not found');
    }

    if (String(lesson.materialType).toLowerCase() === 'video') {
      this.logger.warn(`createPracticeTest rejected — video lesson lessonId=${dto.lessonId}`);
      throw new BadRequestException(
        'Practice tests are not available for video lessons.',
      );
    }

    if (!lesson.practiceEnabled) {
      this.logger.warn(`createPracticeTest rejected — practice disabled lessonId=${dto.lessonId}`);
      throw new ForbiddenException(
        'AI Test Practice is disabled for this lesson by the instructor.',
      );
    }

    if (!lesson.course) {
      this.logger.warn(`createPracticeTest lesson has no course lessonId=${dto.lessonId}`);
      throw new BadRequestException('Lesson is not attached to a course.');
    }

    // Require enrollment for practice generation
    const enrollment = await this.enrollmentRepo.findOne({
      where: {
        user: { id: user.id },
        course: { id: lesson.course.id },
      },
    });
    if (!enrollment) {
      throw new ForbiddenException(
        'You must be enrolled in this course to generate practice tests.',
      );
    }

    if (!lesson.materialLink || !String(lesson.materialLink).startsWith('/uploads/')) {
      throw new BadRequestException(
        'Lesson material is not an uploaded file and cannot be used as practice reference.',
      );
    }

    const fullPath = path.resolve('.', lesson.materialLink.replace(/^[/\\]+/, ''));
    if (!fs.existsSync(fullPath)) {
      throw new BadRequestException(
        `Lesson material file not found at ${lesson.materialLink}.`,
      );
    }

    const sourceDocumentType = this.inferDocumentType(lesson.materialLink);

    const generationRequest = this.requestRepo.create({
      requestId: this.generateRequestId(),
      lessonId: dto.lessonId,
      sourceDocumentUrl: lesson.materialLink,
      sourceDocumentType,
      mcqCount: dto.mcqCount,
      cqCount: dto.cqCount,
      includeVideoTest: dto.includeVideoTest || false,
      status: 'pending',
      isPractice: true,
      createdByUserId: userId,
    });

    await this.requestRepo.save(generationRequest);
    this.logger.log(`createPracticeTest saved request id=${generationRequest.id} requestId=${generationRequest.requestId}`);

    const payload = {
      requestId: generationRequest.id,
      lessonId: dto.lessonId,
      sourceDocumentUrl: lesson.materialLink,
      sourceDocumentType,
      mcqCount: dto.mcqCount,
      cqCount: dto.cqCount,
      includeVideoTest: dto.includeVideoTest || false,
      title: dto.testIndex ? `Practice Test ${dto.testIndex}` : undefined,
      isPractice: true,
      createdByUserId: userId,
    };

    setImmediate(() => {
      this.processGenerationJob(payload).catch((err) => {
        this.logger.error(`Async practice generation failed requestId=${payload.requestId}: ${err.message}`);
      });
    });

    return generationRequest;
  }

  private inferDocumentType(fileUrl: string): string {
    const ext = path.extname(fileUrl).toLowerCase();
    if (ext === '.pdf') return 'pdf';
    if (ext === '.doc' || ext === '.docx') return 'docx';
    if (ext === '.ppt' || ext === '.pptx') return 'ppt';
    return 'pdf';
  }

  async processGenerationJob(data: {
    requestId: number;
    lessonId: number;
    sourceDocumentUrl: string;
    sourceDocumentType: string;
    mcqCount: number;
    cqCount: number;
    includeVideoTest?: boolean;
    title?: string;
    isPractice?: boolean;
    createdByUserId?: string;
  }) {
    this.logger.log(`processGenerationJob start requestId=${data.requestId} lessonId=${data.lessonId}`);
    const generationRequest = await this.requestRepo.findOne({
      where: { id: data.requestId },
    });

    if (!generationRequest) {
      this.logger.warn(`Generation request ${data.requestId} not found`);
      return;
    }

    generationRequest.status = 'processing';
    await this.requestRepo.save(generationRequest);
    this.logger.log(`processGenerationJob status=processing requestId=${data.requestId}`);

    try {
      const fullPath = path.resolve('.', data.sourceDocumentUrl.replace(/^[/\\]+/, ''));
      this.logger.log(`processGenerationJob resolving path ${fullPath}`);

      const normalizedPath = fullPath.replace(/\\/g, '/');
      const uploadsIndex = normalizedPath.indexOf('/uploads/');
      const publicUrl = uploadsIndex >= 0 ? normalizedPath.slice(uploadsIndex) : null;

      if (!fs.existsSync(fullPath)) {
        const err = new Error(`Uploaded file not found at ${fullPath}${publicUrl ? ` (public=${publicUrl})` : ''}`);
        this.logger.error(err.message);
        generationRequest.status = 'failed';
        generationRequest.errorMessage = err.message;
        await this.requestRepo.save(generationRequest);
        throw err;
      }

      this.logger.log(`processGenerationJob file exists size=${fs.statSync(fullPath).size}`);
      const fileBuffer = fs.readFileSync(fullPath);
      const base64Data = fileBuffer.toString('base64');
      const fileMimeType = data.sourceDocumentType === 'pdf' ? 'application/pdf' : 'application/octet-stream';
      this.logger.log(`processGenerationJob file encoded size=${base64Data.length} mime=${fileMimeType}`);

      const mcqQuestions = await this.geminiAiService.generateMcqs(
        '',
        data.mcqCount,
        { data: base64Data, mimeType: fileMimeType },
      );
      this.logger.log(`processGenerationJob got ${mcqQuestions.length} MCQs`);

      let cqQuestions: any[] = [];
      let referenceScript = '';
      if (data.cqCount > 0) {
        this.logger.log(`processGenerationJob generating ${data.cqCount} CQs for requestId=${data.requestId}`);
        const cqResult = await this.geminiAiService.generateCqWithScript(
          '',
          data.cqCount,
          { data: base64Data, mimeType: fileMimeType },
        );
        cqQuestions = cqResult.questions;
        referenceScript = cqResult.referenceScript;
        this.logger.log(`processGenerationJob CQ done questions=${cqQuestions.length} scriptLength=${referenceScript?.length || 0}`);
      }

      let videoTestScript = '';
      if (data.includeVideoTest) {
        this.logger.log(`processGenerationJob generating video script for requestId=${data.requestId}`);
        videoTestScript =
          await this.geminiAiService.generateVideoScript(
            '',
            { data: base64Data, mimeType: fileMimeType },
          );
        this.logger.log(`processGenerationJob video script length=${videoTestScript?.length || 0}`);
      }

      const lesson = await this.lessonRepo.findOne({
        where: { id: data.lessonId },
      });
      if (!lesson) {
        throw new NotFoundException('Lesson not found');
      }

      const isPractice = data.isPractice || false;

      const test = this.testRepo.create({
        title: isPractice ? (data.title || `Practice Test - ${lesson.title}`) : (data.title || `Test for - ${lesson.title}`),
        description: isPractice
          ? 'AI generated practice test from lesson material'
          : 'Auto-generated test from uploaded document',
        testType: isPractice ? 'Practice' : 'Lesson',
        referenceScript: videoTestScript || referenceScript || undefined,
        lesson: { id: data.lessonId } as Lesson,
        status: isPractice ? 'published' : 'draft',
        ...(isPractice && data.createdByUserId
          ? { createdByUserId: data.createdByUserId }
          : {}),
      });
      const savedTest = await this.testRepo.save(test);

      const allQuestions: any[] = [];

      for (const mcq of mcqQuestions.slice(0, data.mcqCount)) {
        const question = this.questionRepo.create({
          questionText: mcq.questionText,
          type: 'MCQ',
          options: mcq.options,
          correctAnswers: mcq.correctAnswers,
          marks: 1,
          evaluationType: 'AI',
          test: { id: savedTest.id } as Test,
        });
        allQuestions.push(question);
      }

      for (const cq of cqQuestions.slice(0, data.cqCount)) {
        const question = this.questionRepo.create({
          questionText: cq.questionText,
          type: 'CQ',
          options: [],
          correctAnswers: cq.correctAnswers || [],
          marks: cq.marks || 2,
          evaluationType: 'AI',
          test: { id: savedTest.id } as Test,
        });
        allQuestions.push(question);
      }

      if (videoTestScript && data.includeVideoTest) {
        const videoScript = this.questionRepo.create({
          questionText: 'Record a video response based on the provided script',
          type: 'Video',
          options: [],
          correctAnswers: [],
          marks: 5,
          postureMarks: 2,
          voiceMarks: 2,
          accuracyMarks: 1,
          evaluationType: 'AI',
          test: { id: savedTest.id } as Test,
        });
        allQuestions.push(videoScript);

        const videoScriptEntity = this.scriptRepo.create({
          testId: savedTest.id,
          scriptText: videoTestScript,
          durationSeconds: 90,
        });
        await this.scriptRepo.save(videoScriptEntity);

        savedTest.videoTestScriptId = videoScriptEntity.id;
        await this.testRepo.save(savedTest);
      }

      await this.questionRepo.save(allQuestions);

      for (const q of allQuestions) {
        await this.generatedQuestionRepo.save({
          questionId: q.id,
          generationRequestId: data.requestId,
          modelUsed: 'gemini-2.0-flash',
        });
      }

      generationRequest.testId = savedTest.id;
      generationRequest.status = 'completed';
      await this.requestRepo.save(generationRequest);

      // Notify enrolled students about the newly created AI test
      if (!isPractice) {
        try {
          const lessonWithCourse = await this.lessonRepo.findOne({
            where: { id: data.lessonId },
            relations: { course: true },
          });
          if (lessonWithCourse?.course) {
            const course = await this.courseRepo.findOne({
              where: { id: lessonWithCourse.course.id },
              relations: { enrollments: { user: true } },
            });
            if (course && course.enrollments) {
              for (const enrollment of course.enrollments) {
                if (!enrollment.user) continue;
                const notification = this.notificationRepo.create({
                  message: `A new test "${savedTest.title}" is available in course ${course.name}.`,
                  user: enrollment.user,
                  actionLink: `/dashboard/learn/${course.courseId}?lesson=${data.lessonId}`,
                });
                const savedNotif =
                  await this.notificationRepo.save(notification);
                this.notificationsGateway.sendNotificationToUser(
                  enrollment.user.userId,
                  {
                    id: savedNotif.id,
                    message: savedNotif.message,
                    actionLink: savedNotif.actionLink,
                    createdAt: savedNotif.createdAt,
                    isRead: false,
                  },
                );
              }
            }
          }
        } catch (err: any) {
          this.logger.error(
            `Failed to notify enrolled students for AI test ${savedTest.id}: ${err?.message}`,
          );
        }
      }

      this.logger.log(`AI generation completed for request ${data.requestId}`);
      return savedTest;
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

  async getGenerationRequest(id: number, requesterUserId?: string, requesterRole?: string) {
    this.logger.log(`getGenerationRequest id=${id}`);
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      this.logger.warn(`Generation request ${id} not found`);
      throw new NotFoundException('Generation request not found');
    }

    if (
      request.isPractice &&
      request.createdByUserId &&
      request.createdByUserId !== requesterUserId &&
      requesterRole !== 'admin' &&
      requesterRole !== 'employee'
    ) {
      this.logger.warn(`getGenerationRequest id=${id} forbidden for ${requesterUserId}`);
      throw new ForbiddenException(
        'You are not allowed to view this generation request.',
      );
    }

    this.logger.log(`getGenerationRequest id=${id} status=${request.status} errorMessage=${request.errorMessage || ''}`);
    return request;
  }

  async getGenerationRequestsByLesson(lessonId: number) {
    return this.requestRepo.find({
      where: { lessonId, isPractice: false },
      order: { createdAt: 'DESC' },
    });
  }

  private generateRequestId(): string {
    return `AIR-${Date.now().toString(36).toUpperCase()}`;
  }
}
