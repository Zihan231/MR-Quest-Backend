import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull, Not } from 'typeorm';
import { Test } from './entities/test.entity';
import { TestSubmission } from './entities/test-submission.entity';
import { SubmissionAnswer } from './entities/submission-answer.entity';
import { Enrollment } from './entities/enrollment.entity';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class ExamSchedulerService {
  private readonly logger = new Logger(ExamSchedulerService.name);

  constructor(
    @InjectRepository(Test) private readonly testRepository: Repository<Test>,
    @InjectRepository(TestSubmission)
    private readonly submissionRepository: Repository<TestSubmission>,
    @InjectRepository(SubmissionAnswer)
    private readonly answerRepository: Repository<SubmissionAnswer>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  @Cron('*/1 * * * *')
  async processExpiredExams() {
    const now = new Date();
    this.logger.log('Running exam scheduler...');

    // 1. Transition scheduled exams to active
    const scheduledExams = await this.testRepository.find({
      where: {
        testType: 'Standalone',
        status: 'scheduled',
        startTime: LessThanOrEqual(now),
      },
    });

    for (const exam of scheduledExams) {
      exam.status = 'active';
      await this.testRepository.save(exam);
      this.logger.log(`Exam ${exam.id} (${exam.title}) transitioned to active`);
    }

    const gracePeriodMs = 60 * 1000;
    const finalizationThreshold = new Date(now.getTime() - gracePeriodMs);

    // 2. Process expired active exams
    const expiredExams = await this.testRepository.find({
      where: {
        testType: 'Standalone',
        status: 'active',
        endTime: LessThanOrEqual(finalizationThreshold),
      },
      relations: { course: true },
    });

    for (const exam of expiredExams) {
      await this.finalizeExam(exam);
    }

    if (scheduledExams.length === 0 && expiredExams.length === 0) {
      this.logger.log('No exams to process.');
    }
  }

  private async finalizeExam(exam: Test) {
    const now = new Date();
    this.logger.log(`Finalizing exam ${exam.id} (${exam.title})`);

    // Update exam status
    exam.status = 'completed';
    await this.testRepository.save(exam);

    if (!exam.course) {
      this.logger.warn(
        `Exam ${exam.id} has no associated course, skipping enrollment check.`,
      );
      return;
    }

    // Find all enrolled users
    const enrollments = await this.enrollmentRepository.find({
      where: { course: { id: exam.course.id } },
      relations: { user: true },
    });

    let autoSubmittedCount = 0;
    let draftSubmittedCount = 0;

    for (const enrollment of enrollments) {
      const user = enrollment.user;

      // Check for existing non-draft submission
      const existingSubmission = await this.submissionRepository.findOne({
        where: {
          test: { id: exam.id },
          user: { id: user.id },
          isDraft: false,
        },
      });

      if (existingSubmission) {
        continue; // Already submitted
      }

      // Check for existing draft
      const draft = await this.submissionRepository.findOne({
        where: {
          test: { id: exam.id },
          user: { id: user.id },
          isDraft: true,
        },
        relations: { answers: { question: true } },
      });

      if (draft) {
        // Auto-submit the draft
        await this.autoSubmitDraft(draft, exam);
        draftSubmittedCount++;
      } else {
        // Create empty submission for non-attempter
        await this.createEmptySubmission(user, exam);
        autoSubmittedCount++;
      }
    }

    this.logger.log(
      `Exam ${exam.id} finalized: ${draftSubmittedCount} drafts auto-submitted, ${autoSubmittedCount} empty submissions created.`,
    );
  }

  private async autoSubmitDraft(draft: TestSubmission, exam: Test) {
    let totalMarks = 0;
    let needsManualEvaluation = false;

    for (const answer of draft.answers) {
      const question = answer.question;
      if (!question) continue;

      if (question.type === 'MCQ') {
        const provided = Array.isArray(answer.providedAnswer)
          ? answer.providedAnswer
          : [answer.providedAnswer];
        const correct = question.correctAnswers || [];
        const isCorrect =
          provided.length === correct.length &&
          provided.every((val) => correct.includes(val));
        if (isCorrect) {
          answer.marksAwarded = question.marks;
          totalMarks += question.marks;
        } else {
          answer.marksAwarded = 0;
        }
      } else if (question.type === 'CQ' || question.type === 'Video') {
        needsManualEvaluation = true;
        answer.marksAwarded = 0;
      }
    }

    draft.isDraft = false;
    draft.submittedAt = exam.endTime || new Date();
    draft.marksObtained = totalMarks;
    draft.status = needsManualEvaluation ? 'Pending Evaluation' : 'Evaluated';

    await this.answerRepository.save(draft.answers);
    await this.submissionRepository.save(draft);
  }

  private async createEmptySubmission(user: User, exam: Test) {
    const submission = new TestSubmission();
    submission.test = exam;
    submission.user = user;
    submission.isDraft = false;
    submission.submittedAt = exam.endTime || new Date();
    submission.marksObtained = 0;
    submission.status = 'Evaluated';
    submission.answers = [];

    await this.submissionRepository.save(submission);
  }

  // Manual trigger for finalizing a specific exam (useful for admin or testing)
  async finalizeExamManually(examId: number) {
    const exam = await this.testRepository.findOne({
      where: { id: examId, testType: 'Standalone' },
      relations: { course: true },
    });

    if (!exam) {
      throw new Error('Exam not found');
    }

    if (exam.status === 'completed') {
      return { message: 'Exam already finalized', examId };
    }

    await this.finalizeExam(exam);
    return { message: 'Exam finalized successfully', examId };
  }
}
