import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { SubmissionAnswer } from '../entities/submission-answer.entity';
import { Question } from '../entities/question.entity';
import { TestSubmission } from '../entities/test-submission.entity';
import { Notification } from '../entities/notification.entity';
import { AiTestGenerationRequest } from '../../ai-testing/entities/ai-test-generation-request.entity';
import { GeminiAiService } from '../../ai-testing/gemini-ai.service';
import { NotificationsGateway } from '../notifications.gateway';

@Injectable()
export class CqEvaluationService {
  private readonly logger = new Logger(CqEvaluationService.name);

  constructor(
    @InjectRepository(SubmissionAnswer)
    private readonly answerRepo: Repository<SubmissionAnswer>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(TestSubmission)
    private readonly submissionRepo: Repository<TestSubmission>,
    @InjectRepository(AiTestGenerationRequest)
    private readonly generationRequestRepo: Repository<AiTestGenerationRequest>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly geminiAiService: GeminiAiService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async evaluateCqAnswer(submissionAnswerId: number): Promise<void> {
    const answer = await this.answerRepo.findOne({
      where: { id: submissionAnswerId },
      relations: { question: true, submission: { test: true, user: true } },
    });

    if (!answer || !answer.submission || !answer.submission.test) {
      this.logger.warn(`SubmissionAnswer ${submissionAnswerId} not found or incomplete`);
      return;
    }

    if (answer.question.type !== 'CQ') {
      this.logger.warn(`Answer ${submissionAnswerId} is not CQ type`);
      return;
    }

    if (answer.question.evaluationType === 'Manual') {
      this.logger.log(`Question ${answer.question.id} is Manual — skipping AI CQ evaluation`);
      return;
    }

    this.logger.log(`Starting CQ evaluation for answer ${submissionAnswerId}`);

    const test = answer.submission.test;
    const testId = test.id;

    let pdfData: { data: string; mimeType: string } | null = null;
    let referenceText: string | null = null;

    // Try AiTestGenerationRequest first (AI-generated tests)
    const generationRequest = await this.generationRequestRepo.findOne({
      where: { testId },
    });

    if (generationRequest && generationRequest.sourceDocumentUrl) {
      const fullPath = path.resolve('.', generationRequest.sourceDocumentUrl.replace(/^[/\\]+/, ''));
      if (fs.existsSync(fullPath)) {
        const fileBuffer = fs.readFileSync(fullPath);
        const base64Data = fileBuffer.toString('base64');
        const mimeType = generationRequest.sourceDocumentType === 'pdf'
          ? 'application/pdf'
          : 'application/octet-stream';
        pdfData = { data: base64Data, mimeType };
      }
    }

    // Fallback to question.referenceScript (per-question, manually created tests)
    const questionScript = answer.question?.referenceScript;
    if (!pdfData && questionScript) {
      const cleanLink = questionScript.replace(/^[/\\]+/, '');
      const localPath = path.resolve('.', cleanLink);
      if (fs.existsSync(localPath)) {
        const fileBuffer = fs.readFileSync(localPath);
        const ext = path.extname(localPath).toLowerCase();
        const mimeType = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';
        pdfData = { data: fileBuffer.toString('base64'), mimeType };
      } else {
        referenceText = questionScript;
      }
    }

    // Legacy fallback to test.referenceScript
    if (!pdfData && !referenceText && test.referenceScript) {
      const cleanLink = test.referenceScript.replace(/^[/\\]+/, '');
      const localPath = path.resolve('.', cleanLink);
      if (fs.existsSync(localPath)) {
        const fileBuffer = fs.readFileSync(localPath);
        const ext = path.extname(localPath).toLowerCase();
        const mimeType = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';
        pdfData = { data: fileBuffer.toString('base64'), mimeType };
      } else {
        referenceText = test.referenceScript;
      }
    }

    if (!pdfData && !referenceText) {
      this.logger.warn(`No reference document or text found for test ${testId} — awarding 0`);
      await this.answerRepo.update(answer.id, {
        marksAwarded: 0,
        evaluatorComment: JSON.stringify({ feedback: 'No reference document available for evaluation.' }),
        evaluatedBy: 'AI',
      });
      await this.recalcSubmission(answer.submission.id);
      return;
    }

    const learnerAnswer = String(answer.providedAnswer || '');
    if (!learnerAnswer.trim()) {
      this.logger.log(`Empty answer for ${submissionAnswerId} — awarding 0`);
      await this.answerRepo.update(answer.id, {
        marksAwarded: 0,
        evaluatorComment: JSON.stringify({ feedback: 'No answer provided.' }),
        evaluatedBy: 'AI',
      });
      await this.recalcSubmission(answer.submission.id);
      return;
    }

    try {
      const result = await this.geminiAiService.evaluateCqAnswer(
        pdfData,
        answer.question.questionText,
        learnerAnswer,
        answer.question.marks || 5,
        referenceText || undefined,
      );

      const marksAwarded = Math.min(result.marksAwarded, answer.question.marks || 5);

      await this.answerRepo.update(answer.id, {
        marksAwarded,
        evaluatorComment: JSON.stringify(result),
        evaluatedBy: 'AI',
      });

      this.logger.log(`CQ evaluation done for answer ${submissionAnswerId}: ${marksAwarded}/${answer.question.marks}`);

      await this.recalcSubmission(answer.submission.id);
      await this.sendNotification(answer.submission, marksAwarded);
    } catch (error) {
      this.logger.error(`CQ evaluation failed for answer ${submissionAnswerId}: ${error.message}`);
      throw error;
    }
  }

  private async recalcSubmission(submissionId: number): Promise<void> {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: { answers: true },
    });
    if (!submission) return;

    const totalAwarded = submission.answers.reduce(
      (sum, a) => sum + (a.marksAwarded || 0),
      0,
    );
    const pendingCount = submission.answers.filter(
      (a) => !a.evaluatedBy,
    ).length;

    await this.submissionRepo.update(submissionId, {
      marksObtained: totalAwarded,
      status: pendingCount > 0 ? 'Pending Evaluation' : 'Evaluated',
    });
  }

  private async sendNotification(
    submission: TestSubmission,
    score: number,
  ): Promise<void> {
    try {
      const full = await this.submissionRepo.findOne({
        where: { id: submission.id },
        relations: {
          user: true,
          test: { course: true, lesson: { course: true } },
        },
      });
      if (!full || !full.user || !full.test) return;

      const course = full.test.course;
      const lesson = full.test.lesson;
      const actionLink = course?.courseId
        ? lesson?.id
          ? `/dashboard/learn/${course.courseId}?lesson=${lesson.id}`
          : `/dashboard/learn/${course.courseId}`
        : '/dashboard?tab=my-learning';

      const notification = this.notificationRepo.create({
        message: `Your CQ answer for "${full.test.title}" has been evaluated by AI. Score: ${score.toFixed(2)}`,
        user: full.user,
        actionLink,
        isRead: false,
      });
      await this.notificationRepo.save(notification);

      this.notificationsGateway.sendNotificationToUser(full.user.userId, {
        id: notification.id,
        message: notification.message,
        actionLink: notification.actionLink,
        createdAt: notification.createdAt,
        isRead: false,
      });
    } catch (err) {
      this.logger.error(`Failed to send CQ evaluation notification: ${err.message}`);
    }
  }
}
