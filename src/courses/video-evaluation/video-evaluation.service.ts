import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { TestSubmission } from '../entities/test-submission.entity';
import { SubmissionAnswer } from '../entities/submission-answer.entity';
import { Question } from '../entities/question.entity';
import { Test } from '../entities/test.entity';
import { Notification } from '../entities/notification.entity';
import * as fs from 'fs';
import * as path from 'path';
import { MediaProcessorService } from '../media-processor.service';
import { CloudStorageService } from '../cloud-storage.service';
import { GeminiAnalysisService } from '../gemini-analysis.service';
import { NotificationsGateway } from '../notifications.gateway';

@Injectable()
export class VideoEvaluationService {
  private readonly logger = new Logger(VideoEvaluationService.name);

  constructor(
    private readonly mediaProcessorService: MediaProcessorService,
    private readonly cloudStorageService: CloudStorageService,
    private readonly geminiAnalysisService: GeminiAnalysisService,
    private readonly notificationsGateway: NotificationsGateway,
    @InjectRepository(TestSubmission)
    private readonly submissionRepo: Repository<TestSubmission>,
    @InjectRepository(SubmissionAnswer)
    private readonly answerRepo: Repository<SubmissionAnswer>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Test)
    private readonly testRepo: Repository<Test>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  async evaluateVideoSubmission(submissionId: number) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: { user: true, test: { questions: true }, answers: { question: true } },
    });

    if (!submission || !submission.test) {
      this.logger.warn(`Submission ${submissionId} not found or has no test`);
      return;
    }

    const test = submission.test;
    const videoAnswer = submission.answers.find(
      (a) => a.question.type === 'Video',
    );

    if (!videoAnswer) {
      this.logger.warn(`No video answer found for submission ${submissionId}`);
      return;
    }

    const videoQuestion = videoAnswer.question;
    if (videoQuestion.evaluationType === 'Manual') {
      this.logger.log(
        `Video question ${videoQuestion.id} is set to Manual evaluation. Skipping AI.`,
      );
      return;
    }

    let filename = String(videoAnswer.providedAnswer || '');
    if (filename.includes('/')) {
      filename = filename.split('/').pop() || filename;
    }

    try {
      this.logger.log(
        `Starting video evaluation for submission ${submissionId}`,
      );
      const assets = await this.mediaProcessorService.processVideoAssets(
        filename,
        submissionId,
      );

      const audioDestination = `evaluations/submission_${submissionId}/audio/extracted_audio.mp3`;
      const [audioGcsUri, snapshotGcsUris] = await Promise.all([
        this.cloudStorageService.uploadFile(assets.audioPath, audioDestination),
        this.cloudStorageService.uploadSnapshots(
          assets.snapshotDir,
          submissionId,
        ),
      ]);

      this.logger.log(`Assets uploaded to GCS for submission ${submissionId}`);

      let scriptGcsUri = '';
      let scriptMimeType = '';
      let scriptText: string | undefined;

      if (test.referenceScript) {
        const cleanLink = test.referenceScript.replace(/^[/\\]+/, '');
        const localPath = path.resolve('.', cleanLink);
        if (fs.existsSync(localPath)) {
          const ext = path.extname(localPath).toLowerCase();
          let shouldUpload = true;

          if (ext === '.docx' || ext === '.pptx' || ext === '.ppt') {
            scriptMimeType =
              ext === '.docx'
                ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
            try {
              const ast = await (
                await import('officeparser')
              ).OfficeParser.parseOffice(localPath);
              scriptText = ast.toText();
              shouldUpload = false;
            } catch (e) {
              this.logger.error(
                `Failed to parse script document: ${e.message}`,
              );
            }
          } else if (ext === '.pdf') {
            scriptMimeType = 'application/pdf';
          }

          if (shouldUpload) {
            const scriptDestination = `evaluations/${test.id}/script/${path.basename(localPath)}`;
            try {
              scriptGcsUri = await this.cloudStorageService.uploadFile(
                localPath,
                scriptDestination,
              );
            } catch (scriptUploadError) {
              this.logger.error(
                `Failed to upload reference script: ${scriptUploadError.message}`,
              );
            }
          }
        } else {
          scriptText = test.referenceScript;
        }
      } else {
        scriptText =
          "No reference script was provided for this test. Evaluate the candidate's general communication structure and flow.";
      }

      const pMarks = videoQuestion.postureMarks ?? videoQuestion.marks / 3;
      const vMarks = videoQuestion.voiceMarks ?? videoQuestion.marks / 3;
      const aMarks = videoQuestion.accuracyMarks ?? videoQuestion.marks / 3;

      const evaluationResult =
        await this.geminiAnalysisService.evaluateCandidate(
          audioGcsUri,
          snapshotGcsUris,
          scriptGcsUri,
          scriptMimeType,
          pMarks,
          vMarks,
          aMarks,
          scriptText,
        );

      this.logger.log(
        `Gemini evaluation complete for submission ${submissionId}`,
      );

      await this.answerRepo.update(videoAnswer.id, {
        marksAwarded: evaluationResult.overallScore,
        evaluatorComment: JSON.stringify(evaluationResult),
        evaluatedBy: 'AI',
      });

      const pendingAnswersCount = await this.answerRepo.count({
        where: {
          submission: { id: submissionId },
          evaluatedBy: IsNull(),
        },
      });

      const newMarksObtained =
        submission.marksObtained + evaluationResult.overallScore;
      await this.submissionRepo.update(submissionId, {
        marksObtained: newMarksObtained,
        status: pendingAnswersCount > 0 ? 'Pending Evaluation' : 'Evaluated',
      });

      await this.sendEvaluationNotification(
        submission,
        evaluationResult.overallScore,
      );

      this.logger.log(
        `Video evaluation completed for submission ${submissionId}`,
      );
    } catch (error) {
      this.logger.error(
        `Video evaluation failed for submission ${submissionId}: ${error.message}`,
      );
      await this.submissionRepo.update(submissionId, {
        status: 'Pending Evaluation',
      });
      throw error;
    } finally {
      this.cleanupTempFiles(submissionId);
    }
  }

  private async sendEvaluationNotification(
    submission: TestSubmission,
    score: number,
  ) {
    try {
      const fullSubmission = await this.submissionRepo.findOne({
        where: { id: submission.id },
        relations: {
          user: true,
          test: { course: true, lesson: { course: true } },
        },
      });

      if (fullSubmission && fullSubmission.user && fullSubmission.test) {
        const course = fullSubmission.test.course;
        const lesson = fullSubmission.test.lesson;
        const actionLink = course?.courseId
          ? lesson?.id
            ? `/dashboard/learn/${course.courseId}?lesson=${lesson.id}`
            : `/dashboard/learn/${course.courseId}`
          : '/dashboard?tab=my-learning';
        const notification = this.notificationRepo.create({
          message: `Your test "${fullSubmission.test.title}" has been evaluated by AI. Your score: ${score.toFixed(2)}`,
          user: fullSubmission.user,
          actionLink,
          isRead: false,
        });
        await this.notificationRepo.save(notification);

        this.notificationsGateway.sendNotificationToUser(
          fullSubmission.user.userId,
          {
            id: notification.id,
            message: notification.message,
            actionLink: notification.actionLink,
            createdAt: notification.createdAt,
            isRead: false,
          },
        );
      }
    } catch (notifErr) {
      this.logger.error(
        `Failed to send evaluation notification: ${notifErr.message}`,
      );
    }
  }

  private cleanupTempFiles(submissionId: number) {
    try {
      const outputDir = path.resolve(
        `./uploads/VdoEva/submission_${submissionId}`,
      );
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 5000,
        });
        this.logger.log(
          `Cleaned up temporary files for submission ${submissionId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to cleanup temp files for submission ${submissionId}: ${err.message}`,
      );
    }
  }
}
