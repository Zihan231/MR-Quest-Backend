import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, In, MoreThanOrEqual } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Test } from './entities/test.entity';
import { Question } from './entities/question.entity';
import { TestSubmission } from './entities/test-submission.entity';
import { SubmissionAnswer } from './entities/submission-answer.entity';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { Enrollment } from './entities/enrollment.entity';
import { User } from '../auth/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';
import { CreateTestDto } from './dto/create-test.dto';
import { SubmitTestDto } from './dto/submit-test.dto';
import { EvaluateCqDto } from './dto/evaluate-cq.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { UpdateMarksDto } from './dto/update-marks.dto';
import { MediaProcessorService } from './media-processor.service';
// import { SpeechService } from './speech.service';
import { CloudStorageService } from './cloud-storage.service';
import { GeminiAnalysisService } from './gemini-analysis.service';
import { VideoEvaluationService } from './video-evaluation/video-evaluation.service';
import { CqEvaluationService } from './cq-evaluation/cq-evaluation.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@Injectable()
export class TestsService {
  private readonly logger = new Logger(TestsService.name);

  constructor(
    @InjectRepository(Test) private testRepo: Repository<Test>,
    @InjectRepository(Question) private questionRepo: Repository<Question>,
    @InjectRepository(TestSubmission)
    private submissionRepo: Repository<TestSubmission>,
    @InjectRepository(SubmissionAnswer)
    private answerRepo: Repository<SubmissionAnswer>,
    @InjectRepository(Course) private courseRepo: Repository<Course>,
    @InjectRepository(Lesson) private lessonRepo: Repository<Lesson>,
    @InjectRepository(Enrollment)
    private enrollmentRepo: Repository<Enrollment>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
    private readonly notificationsGateway: NotificationsGateway,
    private mediaProcessorService: MediaProcessorService,
    // private speechService: SpeechService,
    private readonly cloudStorageService: CloudStorageService,
    private readonly geminiAnalysisService: GeminiAnalysisService,
    private readonly videoEvaluationService: VideoEvaluationService,
    private readonly cqEvaluationService: CqEvaluationService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async createTest(createDto: CreateTestDto, userId: string, role: string) {
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException('Only admin or employee can create tests');
    }

    const test = new Test();
    test.title = createDto.title;
    test.description = createDto.description || '';
    test.testType = createDto.testType;
    test.referenceScript = createDto.referenceScript || undefined;
    if (createDto.startTime) test.startTime = new Date(createDto.startTime);
    if (createDto.endTime) test.endTime = new Date(createDto.endTime);

    const now = new Date();
    if (createDto.testType === 'Standalone') {
      if (test.startTime && now < test.startTime) {
        test.status = 'scheduled';
      } else if (test.endTime && now > test.endTime) {
        test.status = 'completed';
      } else {
        test.status = 'active';
      }
    } else {
      test.status = 'published';
    }

    if (createDto.courseId) {
      const course = await this.courseRepo.findOne({
        where: { id: createDto.courseId },
      });
      if (!course) throw new NotFoundException('Course not found');
      test.course = course;
    }

    if (createDto.lessonId) {
      const lesson = await this.lessonRepo.findOne({
        where: { id: createDto.lessonId },
        relations: { course: true },
      });
      if (!lesson) throw new NotFoundException('Lesson not found');
      test.lesson = lesson;
      if (!test.course && lesson.course) {
        test.course = lesson.course;
      }
    }

    test.questions = createDto.questions.map((q) => {
      const question = new Question();
      question.questionText = q.questionText;
      question.type = q.type;
      question.marks = q.marks;
      if (q.postureMarks !== undefined) question.postureMarks = q.postureMarks;
      if (q.voiceMarks !== undefined) question.voiceMarks = q.voiceMarks;
      if (q.accuracyMarks !== undefined)
        question.accuracyMarks = q.accuracyMarks;
      question.evaluationType = q.evaluationType || 'AI';
      if (q.referenceScript) question.referenceScript = q.referenceScript;
      if (q.type === 'MCQ') {
        question.options = q.options || [];
        question.correctAnswers = q.correctAnswers || [];
      }
      return question;
    });

    const savedTest = await this.testRepo.save(test);

    // Audit log
    await this.logAction(userId, 'TEST_CREATED', 'Test', savedTest.title, String(savedTest.id), {
      testId: savedTest.id,
      title: savedTest.title,
      testType: savedTest.testType,
      courseId: savedTest.course?.id,
      lessonId: savedTest.lesson?.id,
      status: savedTest.status,
    });

    // Trigger Notification for Enrolled Users
    if (test.course) {
      const course = await this.courseRepo.findOne({
        where: { id: test.course.id },
        relations: { enrollments: { user: true } },
      });
      if (course && course.enrollments) {
        for (const enrollment of course.enrollments) {
          const notification = new Notification();
          notification.message = `A new test "${test.title}" is available in course ${course.name}.`;
          notification.user = enrollment.user;
          notification.actionLink = test.lesson
            ? `/dashboard/learn/${course.courseId}?lesson=${test.lesson.id}`
            : `/dashboard/learn/${course.courseId}`;
          const savedNotif = await this.notificationRepo.save(notification);

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

    return savedTest;
  }

  async getTestsForLesson(lessonId: number) {
    return this.testRepo.find({
      where: { lesson: { id: lessonId }, testType: Not('Practice') },
      relations: { questions: true },
      order: { id: 'DESC' },
    });
  }

  async getTestsForCourse(courseIdOrCode: number | string) {
    const courseIdStr = String(courseIdOrCode).trim();
    const isNumeric =
      /^[0-9]+$/.test(courseIdStr) &&
      String(Number(courseIdStr)) === courseIdStr;

    const course = isNumeric
      ? await this.courseRepo.findOne({ where: { id: Number(courseIdStr) } })
      : await this.courseRepo.findOne({ where: { courseId: courseIdStr } });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return this.testRepo.find({
      where: { course: { id: course.id }, testType: 'Course' },
      relations: { questions: true },
      order: { id: 'DESC' },
    });
  }

  async getMySubmission(testId: number, userId: string) {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');
    const submission = await this.submissionRepo.findOne({
      where: { test: { id: testId }, user: { id: user.id }, isDraft: false },
      relations: { answers: { question: true } },
      order: { createdAt: 'DESC' },
    });
    if (submission) {
      // Filter to only include answers where the student actually provided an answer
      // This ensures CQ and Video answers are visible in review even if unevaluated,
      // while still excluding empty draft answers
      submission.answers = submission.answers.filter(
        (a) =>
          a.providedAnswer !== null &&
          a.providedAnswer !== undefined &&
          a.providedAnswer !== '',
      );
    }
    return submission;
  }

  async getSubmissionById(submissionId: number) {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: { user: true, test: true, answers: { question: true } },
    });
    if (submission) {
      // Filter to only include answers where the student actually provided an answer
      // This ensures CQ and Video answers are visible in review even if unevaluated,
      // while still excluding empty draft answers
      submission.answers = submission.answers.filter(
        (a) =>
          a.providedAnswer !== null &&
          a.providedAnswer !== undefined &&
          a.providedAnswer !== '',
      );
    }
    return submission;
  }

  async getStandaloneExamsForCourse(
    courseIdOrCode: number | string,
    role: string = 'user',
  ) {
    const courseIdStr = String(courseIdOrCode).trim();
    const isNumeric =
      /^[0-9]+$/.test(courseIdStr) &&
      String(Number(courseIdStr)) === courseIdStr;

    const course = isNumeric
      ? await this.courseRepo.findOne({ where: { id: Number(courseIdStr) } })
      : await this.courseRepo.findOne({ where: { courseId: courseIdStr } });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const whereClause: any = {
      course: { id: course.id },
      testType: In(['Standalone', 'standalone']),
    };

    if (role !== 'admin' && role !== 'employee') {
      // Users should be able to see standalone timed exams as soon as they're added,
      // even if the startTime is in the future (status = 'scheduled').
      whereClause.status = In([
        'published',
        'scheduled',
        'active',
        'completed',
      ]);
    }

    return this.testRepo.find({
      where: whereClause,
      relations: { questions: true },
      order: { createdAt: 'DESC' },
    });
  }

  async submitTest(submitDto: SubmitTestDto, userId: string) {
    const test = await this.testRepo.findOne({
      where: { id: submitDto.testId },
      relations: { questions: true, course: true, lesson: true },
    });
    if (!test) throw new NotFoundException('Test not found');

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');
    const userInternalId = user.id;

    if (test.testType === 'Standalone') {
      const now = new Date();
      if (test.startTime && now < test.startTime)
        throw new BadRequestException('Exam has not started yet');
      const gracePeriodMs = 60 * 1000; // 1 minute grace period
      if (
        test.endTime &&
        now.getTime() > test.endTime.getTime() + gracePeriodMs
      )
        throw new BadRequestException('Exam has ended');

      // Ensure enrolled
      if (test.course) {
        const enrollment = await this.enrollmentRepo.findOne({
          where: {
            course: { id: test.course.id },
            user: { id: userInternalId },
          },
        });
        if (!enrollment)
          throw new ForbiddenException(
            'You must be enrolled in this course to take this exam',
          );
      }
    }

    // Check previous submissions
    const previousSubmission = await this.submissionRepo.findOne({
      where: {
        test: { id: test.id },
        user: { id: userInternalId },
        isDraft: false,
      },
      order: { createdAt: 'ASC' },
    });

    // If it's not a draft and user is submitting a new one for retake
    let submission = new TestSubmission();

    // Find if there is an existing draft
    const existingDraft = await this.submissionRepo.findOne({
      where: {
        test: { id: test.id },
        user: { id: userInternalId },
        isDraft: true,
      },
      relations: { answers: true },
    });

    if (existingDraft) {
      submission = existingDraft;
    } else {
      submission.test = test;
      submission.user = { id: userInternalId } as any;
    }

    submission.isDraft = submitDto.isDraft || false;
    if (!submission.isDraft) {
      submission.submittedAt = new Date();
    }

    if (!submission.isDraft) {
      for (const question of test.questions) {
        if (question.type === 'Video') {
          const provided = submitDto.answers.find(
            (ans) => ans.questionId === question.id,
          );
          if (
            !provided ||
            !provided.providedAnswer ||
            String(provided.providedAnswer).trim() === '' ||
            provided.providedAnswer === 'Uploading...'
          ) {
            throw new BadRequestException(
              `A video response is required for question: "${question.questionText}"`,
            );
          }
        }
      }
    }

    let totalMarks = 0;
    let needsManualEvaluation = false;
    let needsHumanReview = false;

    // Remove old answers for draft update
    if (existingDraft && existingDraft.answers) {
      await this.answerRepo.remove(existingDraft.answers);
    }

    submission.answers = [];
    const cqAnswerIndices: number[] = [];

    for (const [index, ans] of submitDto.answers.entries()) {
      const question = test.questions.find((q) => q.id === ans.questionId);
      if (!question) continue;

      const subAnswer = new SubmissionAnswer();
      subAnswer.question = question;
      subAnswer.providedAnswer = ans.providedAnswer;

      if (!submission.isDraft) {
        if (question.type === 'MCQ') {
          // Auto evaluation
          subAnswer.evaluatedBy = 'System';
          const provided = Array.isArray(ans.providedAnswer)
            ? ans.providedAnswer
            : [ans.providedAnswer];
          const correct = question.correctAnswers || [];

          // Check if exactly same elements
          const isCorrect =
            provided.length === correct.length &&
            provided.every((val) => correct.includes(val));
          if (isCorrect) {
            subAnswer.marksAwarded = question.marks;
            totalMarks += question.marks;
          } else {
            subAnswer.marksAwarded = 0;
          }
        } else if (question.type === 'CQ') {
          needsManualEvaluation = true;
          subAnswer.marksAwarded = 0; // pending
          cqAnswerIndices.push(index);
        } else if (question.type === 'Video') {
          needsManualEvaluation = true;
          subAnswer.marksAwarded = 0; // pending
        }

        if (
          question.evaluationType === 'Manual' &&
          (question.type === 'CQ' || question.type === 'Video')
        ) {
          needsHumanReview = true;
        }
      }

      submission.answers.push(subAnswer);
    }

    submission.marksObtained = totalMarks;
    submission.status =
      needsManualEvaluation && !submission.isDraft
        ? 'Pending Evaluation'
        : 'Evaluated';

    // If user has already submitted before, do NOT save this second attempt to DB (practice mode)
    if (previousSubmission) {
      return submission;
    }

    // Save initial submission state
    const saved = await this.submissionRepo.save(submission);

    // Notify admins/employees when a student submits a test that needs human review
    if (!submission.isDraft && needsHumanReview) {
      await this.notifyStaffOnSubmission(user, test);
    }

    // Auto-complete lesson if it's a lesson-level test and not a draft
    if (
      test.testType === 'Lesson' &&
      !submission.isDraft &&
      test.lesson &&
      test.course
    ) {
      const enrollment = await this.enrollmentRepo.findOne({
        where: { user: { id: userInternalId }, course: { id: test.course.id } },
        relations: { completedLessons: true, course: { lessons: true } },
      });
      if (enrollment) {
        const alreadyCompleted = enrollment.completedLessons.some(
          (cl) => cl.id === test.lesson.id,
        );
        if (!alreadyCompleted) {
          enrollment.completedLessons.push(test.lesson);
          const totalLessons = enrollment.course.lessons.length;
          const completedCount = enrollment.completedLessons.length;
          enrollment.progress =
            Math.round((completedCount / totalLessons) * 100 * 100) / 100;
          await this.enrollmentRepo.save(enrollment);
        }
      }
    }
    // --- INLINE AI EVALUATION ---
    if (!submission.isDraft && needsManualEvaluation) {
      const videoAnswer = submitDto.answers.find((ans) => {
        const q = test.questions.find((quest) => quest.id === ans.questionId);
        return q && q.type === 'Video';
      });

      if (videoAnswer && videoAnswer.providedAnswer) {
        const videoQuestion = test.questions.find(
          (quest) => quest.id === videoAnswer.questionId,
        );
        if (videoQuestion && videoQuestion.evaluationType !== 'Manual') {
          await this.videoEvaluationService
            .evaluateVideoSubmission(saved.id)
            .catch((err) =>
              this.logger.error(`Video evaluation failed: ${err.message}`),
            );
        }
      }

      for (const idx of cqAnswerIndices) {
        const cqAnswer = saved.answers[idx];
        if (cqAnswer && cqAnswer.id) {
          await this.cqEvaluationService
            .evaluateCqAnswer(cqAnswer.id)
            .catch((err) =>
              this.logger.error(`CQ evaluation failed for answer ${cqAnswer.id}: ${err.message}`),
            );
        }
      }
    }

    return saved;
  }

  async getPendingEvaluations(
    userId: string,
    role: string,
    lessonId?: number,
    testId?: number,
  ) {
    if (role !== 'admin' && role !== 'employee') throw new ForbiddenException();

    const whereCondition: any = { isDraft: false };
    if (testId) {
      whereCondition.test = { id: testId, testType: Not('Practice') };
    } else if (lessonId) {
      whereCondition.test = {
        lesson: { id: lessonId },
        testType: Not('Practice'),
      };
    } else {
      whereCondition.status = 'Pending Evaluation';
      whereCondition.test = { testType: Not('Practice') };
    }

    return this.submissionRepo.find({
      where: whereCondition,
      relations: {
        test: { lesson: { course: true }, course: true },
        user: true,
        answers: { question: true },
      },
      order: { createdAt: 'DESC' },
    });
  }

  async evaluateCq(evalDto: EvaluateCqDto, userId: string, role: string) {
    if (role !== 'admin' && role !== 'employee') throw new ForbiddenException();

    const submission = await this.submissionRepo.findOne({
      where: { id: evalDto.testSubmissionId },
      relations: { answers: { question: true } },
    });

    if (!submission) throw new NotFoundException('Submission not found');

    let newMarksAdded = 0;

    for (const ev of evalDto.evaluations) {
      const ans = submission.answers.find(
        (a) => a.id === ev.submissionAnswerId,
      );
      if (
        ans &&
        (ans.question.type === 'CQ' || ans.question.type === 'Video')
      ) {
        if (ev.marksAwarded < 0 || ev.marksAwarded > ans.question.marks) {
          throw new BadRequestException(
            `Awarded marks (${ev.marksAwarded}) cannot exceed maximum allowed marks (${ans.question.marks}) for question "${ans.question.questionText}".`,
          );
        }

        const oldMarks = ans.marksAwarded || 0;
        ans.marksAwarded = ev.marksAwarded;
        ans.evaluatorComment = ev.evaluatorComment || '';

        // Preserve AI evaluation flag if it was already reviewed by AI
        const isPreviouslyAi =
          ans.evaluatedBy && ans.evaluatedBy.toUpperCase() === 'AI';
        if (!(ans.question.type === 'Video' && isPreviouslyAi)) {
          ans.evaluatedBy = 'Human';
        }

        newMarksAdded += ev.marksAwarded - oldMarks;
      }
    }

    submission.marksObtained += newMarksAdded;
    submission.status = 'Evaluated';

    // Save answers
    await this.answerRepo.save(submission.answers);
    const savedSub = await this.submissionRepo.save(submission);

    // Send notification to the student
    let fullSubmission: TestSubmission | null = null;
    try {
      fullSubmission = await this.submissionRepo.findOne({
        where: { id: savedSub.id },
        relations: { user: true, test: { course: true, lesson: { course: true } } },
      });
      if (fullSubmission && fullSubmission.user) {
        const notification = new Notification();
        notification.message = `Your submission for test "${fullSubmission.test.title}" has been evaluated.`;
        notification.user = fullSubmission.user;
        notification.actionLink = this.buildCourseLessonLink(
          fullSubmission.test,
        );
        const savedNotif = await this.notificationRepo.save(notification);

        this.notificationsGateway.sendNotificationToUser(
          fullSubmission.user.userId,
          {
            id: savedNotif.id,
            message: savedNotif.message,
            actionLink: savedNotif.actionLink,
            createdAt: savedNotif.createdAt,
            isRead: false,
          },
        );
      }
    } catch (notifErr) {
      console.error(
        `[Notification] Failed to notify user for manual evaluation:`,
        notifErr,
      );
    }

    await this.logAction(
      userId,
      'TEST_MARKS_EVALUATED',
      'Submission',
      `Submission #${savedSub.id}`,
      String(savedSub.id),
      {
        submissionId: savedSub.id,
        changedFields: evalDto.evaluations.map((e) => e.submissionAnswerId),
      },
      fullSubmission?.test?.course?.courseId ||
        fullSubmission?.test?.lesson?.course?.courseId,
    );

    return savedSub;
  }

  async updateSubmissionMarks(
    submissionId: number,
    dto: UpdateMarksDto,
    userId: string,
  ) {
    // Admin-only: always re-verify role from DB, never trust the JWT payload
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admin users can edit student marks');
    }

    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: {
        answers: { question: true },
        user: true,
        test: { course: true, lesson: { course: true } },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const changes: any[] = [];
    let marksDiff = 0;

    for (const ev of dto.answers) {
      const ans = submission.answers.find((a) => a.id === ev.submissionAnswerId);
      if (!ans) continue;
      // Only CQ and Video answers carry manually editable marks
      if (ans.question.type !== 'CQ' && ans.question.type !== 'Video') {
        continue;
      }

      if (ev.marksAwarded < 0 || ev.marksAwarded > ans.question.marks) {
        throw new BadRequestException(
          `Awarded marks (${ev.marksAwarded}) cannot exceed maximum allowed marks (${ans.question.marks}) for question "${ans.question.questionText}".`,
        );
      }

      const oldMarks = ans.marksAwarded || 0;
      const oldComment = ans.evaluatorComment || '';
      if (
        oldMarks === ev.marksAwarded &&
        oldComment === (ev.evaluatorComment || '')
      ) {
        continue;
      }

      ans.marksAwarded = ev.marksAwarded;
      if (ev.evaluatorComment !== undefined) {
        ans.evaluatorComment = ev.evaluatorComment;
      }
      ans.evaluatedBy = 'Human';

      marksDiff += ev.marksAwarded - oldMarks;
      changes.push({
        question: ans.question.questionText,
        from: oldMarks,
        to: ev.marksAwarded,
      });
    }

    if (!changes.length) {
      return submission;
    }

    submission.marksObtained = Math.max(
      0,
      submission.marksObtained + marksDiff,
    );
    submission.status = 'Evaluated';

    await this.answerRepo.save(submission.answers);
    const savedSub = await this.submissionRepo.save(submission);

    // Send notification to the student
    try {
      if (savedSub.user) {
        const notification = new Notification();
        notification.message = `Your marks for test "${savedSub.test.title}" have been updated.`;
        notification.user = savedSub.user;
        notification.actionLink = this.buildCourseLessonLink(savedSub.test);
        const savedNotif = await this.notificationRepo.save(notification);

        this.notificationsGateway.sendNotificationToUser(
          savedSub.user.userId,
          {
            id: savedNotif.id,
            message: savedNotif.message,
            actionLink: savedNotif.actionLink,
            createdAt: savedNotif.createdAt,
            isRead: false,
          },
        );
      }
    } catch (notifErr) {
      console.error(
        `[Notification] Failed to notify user for mark update:`,
        notifErr,
      );
    }

    // Audit log
    await this.activityLogsService.log({
      actorId: user.userId,
      actorName: user.name,
      actorRole: user.role,
      action: 'MARKS_EDITED',
      targetType: 'Submission',
      targetName: savedSub.test.title || `Submission #${savedSub.id}`,
      targetId: String(savedSub.id),
      courseId:
        savedSub.test?.course?.courseId ||
        savedSub.test?.lesson?.course?.courseId,
      details: {
        studentUserId: savedSub.user?.userId,
        studentName: savedSub.user?.name,
        testId: savedSub.test?.id,
        changes,
      },
    });

    return savedSub;
  }

  async getLeaderboard(lessonId: number) {
    // Find all evaluated submissions for tests linked to this lesson
    const tests = await this.testRepo.find({
      where: { lesson: { id: lessonId }, testType: Not('Practice') },
    });
    if (!tests.length) return [];

    const testIds = tests.map((t) => t.id);

    const submissions = await this.submissionRepo
      .createQueryBuilder('sub')
      .leftJoinAndSelect('sub.user', 'user')
      .where('sub.testId IN (:...testIds)', { testIds })
      .andWhere('sub.isDraft = :isDraft', { isDraft: false })
      .andWhere('sub.status = :status', { status: 'Evaluated' })
      .orderBy('sub.submittedAt', 'ASC')
      .getMany();

    // Group by user, taking only their FIRST attempt for ranking
    const userFirstAttempts = new Map<number, any>();
    for (const sub of submissions) {
      if (!userFirstAttempts.has(sub.user.id)) {
        userFirstAttempts.set(sub.user.id, sub);
      }
    }

    const leaderboard = Array.from(userFirstAttempts.values()).map((sub) => ({
      userId: sub.user.userId,
      name: sub.user.name,
      marksObtained: sub.marksObtained,
      submittedAt: sub.submittedAt,
    }));

    // Sort leaderboard by marksObtained DESC, then by submittedAt ASC
    leaderboard.sort((a, b) => {
      if (b.marksObtained !== a.marksObtained) {
        return b.marksObtained - a.marksObtained;
      }
      return (
        new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
      );
    });

    return leaderboard.slice(0, 5);
  }

  private deletePhysicalFile(fileLink: string) {
    if (fileLink && fileLink.startsWith('/uploads/')) {
      const filePath = path.resolve('.', fileLink.replace(/^[/\\]+/, ''));
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(
            `[Trash Cleanup] Successfully deleted orphaned reference script: ${filePath}`,
          );
        }
      } catch (err) {
        console.error(
          `[Trash Cleanup] Failed to delete orphaned reference script: ${filePath}`,
          err,
        );
      }
    }
  }

  async updateQuestion(
    questionId: number,
    data: {
      questionText?: string;
      options?: string[];
      correctAnswers?: string[];
      marks?: number;
      postureMarks?: number;
      voiceMarks?: number;
      accuracyMarks?: number;
      evaluationType?: string;
      referenceScript?: string;
    },
    role: string,
  ) {
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException('Only admin or employee can edit questions');
    }
    const question = await this.questionRepo.findOne({
      where: { id: questionId },
      relations: { test: true },
    });
    if (!question) throw new NotFoundException('Question not found');

    if (data.questionText !== undefined)
      question.questionText = data.questionText;
    if (data.options !== undefined) question.options = data.options;
    if (data.correctAnswers !== undefined)
      question.correctAnswers = data.correctAnswers;
    if (data.marks !== undefined) question.marks = data.marks;
    if (data.postureMarks !== undefined)
      question.postureMarks = data.postureMarks;
    if (data.voiceMarks !== undefined) question.voiceMarks = data.voiceMarks;
    if (data.accuracyMarks !== undefined)
      question.accuracyMarks = data.accuracyMarks;
    if (data.evaluationType !== undefined)
      question.evaluationType = data.evaluationType;

    if (data.referenceScript !== undefined) {
      const oldScript = question.referenceScript;

      // If there was an old file path, and it is different from the new script, delete it!
      if (oldScript && oldScript !== data.referenceScript) {
        const isOldFile =
          oldScript.startsWith('http') ||
          oldScript.startsWith('/') ||
          (oldScript.length < 200 &&
            /\.(pdf|docx|doc|pptx|ppt)$/i.test(oldScript));
        if (isOldFile) {
          let pathPart = oldScript;
          if (pathPart.includes('/uploads/')) {
            pathPart = '/uploads/' + pathPart.split('/uploads/').pop();
          }
          this.deletePhysicalFile(pathPart);
        }
      }

      question.referenceScript = data.referenceScript || undefined;
    }

    return this.questionRepo.save(question);
  }

  async getLessonSubmissions(lessonId: number) {
    const tests = await this.testRepo.find({
      where: { lesson: { id: lessonId }, testType: Not('Practice') },
    });
    if (!tests.length) return { submissions: [], remaining: 0 };

    const testIds = tests.map((t) => t.id);

    const submissions = await this.submissionRepo.find({
      where: { test: { id: In(testIds) }, isDraft: false, status: 'Evaluated' },
      relations: { user: true, test: true },
      order: { submittedAt: 'DESC' },
    });

    const lesson = await this.lessonRepo.findOne({
      where: { id: lessonId },
      relations: { course: true },
    });
    let remaining = 0;
    if (lesson?.course?.id) {
      const totalEnrolled = await this.enrollmentRepo.count({
        where: { course: { id: lesson.course.id } },
      });
      const uniqueSubmittedUserIds = new Set(
        submissions
          .map((s) => s.user?.id)
          .filter((id): id is number => id !== undefined && id !== null),
      );
      remaining = totalEnrolled - uniqueSubmittedUserIds.size;
    }

    return {
      submissions,
      remaining: Math.max(0, remaining),
    };
  }

  async getTestSubmissions(testId: number) {
    const test = await this.testRepo.findOne({
      where: { id: testId, testType: Not('Practice') },
      relations: { course: true },
    });
    if (!test) return { submissions: [], remaining: 0 };

    const submissions = await this.submissionRepo.find({
      where: { test: { id: testId }, isDraft: false, status: 'Evaluated' },
      relations: { user: true, test: true },
      order: { submittedAt: 'DESC' },
    });

    let remaining = 0;
    if (test.course?.id) {
      const totalEnrolled = await this.enrollmentRepo.count({
        where: { course: { id: test.course.id } },
      });
      const uniqueSubmittedUserIds = new Set(
        submissions
          .map((s) => s.user?.id)
          .filter((id): id is number => id !== undefined && id !== null),
      );
      remaining = totalEnrolled - uniqueSubmittedUserIds.size;
    }

    return {
      submissions,
      remaining: Math.max(0, remaining),
    };
  }

  async updateTest(testId: number, dto: UpdateTestDto, role: string, userId: string) {
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin or employee can edit test configuration',
      );
    }
    const test = await this.testRepo.findOne({ where: { id: testId } });
    if (!test) throw new NotFoundException('Test not found');

    if (dto.title !== undefined) test.title = dto.title;
    if (dto.description !== undefined) test.description = dto.description;
    if (dto.referenceScript !== undefined)
      test.referenceScript = dto.referenceScript || undefined;
    if (dto.startTime !== undefined)
      test.startTime = dto.startTime
        ? new Date(dto.startTime)
        : (undefined as any);
    if (dto.endTime !== undefined)
      test.endTime = dto.endTime ? new Date(dto.endTime) : (undefined as any);

    // Recalculate status for Standalone exams if times changed
    if (test.testType === 'Standalone') {
      const now = new Date();
      if (test.startTime && now < test.startTime) {
        test.status = 'scheduled';
      } else if (test.endTime && now > test.endTime) {
        test.status = 'completed';
      } else {
        test.status = 'active';
      }
    }

    const saved = await this.testRepo.save(test);

    await this.logAction(
      userId,
      'TEST_UPDATED',
      'Test',
      saved.title,
      String(saved.id),
      {
        testId: saved.id,
        title: saved.title,
        changedFields: Object.keys(dto).filter((k) => (dto as any)[k] !== undefined),
      },
    );

    return saved;
  }

  async deleteTest(
    testId: number,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const test = await this.testRepo.findOne({
      where: { id: testId },
      relations: { questions: true },
    });
    if (!test) {
      throw new NotFoundException('Test not found');
    }

    // Clean up reference script files
    if (test.referenceScript) this.deletePhysicalFile(test.referenceScript);
    for (const q of test.questions || []) {
      if (q.referenceScript) this.deletePhysicalFile(q.referenceScript);
    }

    const title = test.title;
    const targetId = String(test.id);
    await this.testRepo.remove(test);

    await this.logAction(userId, 'TEST_DELETED', 'Test', title, targetId, {
      testId: targetId,
      title,
    });

    return { success: true, message: 'Test successfully deleted' };
  }

  async getMyPracticeTests(lessonId: number, userId: string) {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.testRepo.find({
      where: {
        lesson: { id: lessonId },
        testType: 'Practice',
        createdByUserId: user.userId,
      },
      relations: { questions: true },
      order: { id: 'DESC' },
    });
  }

  async deletePracticeTest(
    testId: number,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    const test = await this.testRepo.findOne({
      where: { id: testId, testType: 'Practice', createdByUserId: user.userId },
      relations: { questions: true },
    });
    if (!test) {
      throw new NotFoundException('Practice test not found');
    }

    // Clean up reference script files
    if (test.referenceScript) this.deletePhysicalFile(test.referenceScript);
    for (const q of test.questions || []) {
      if (q.referenceScript) this.deletePhysicalFile(q.referenceScript);
    }

    await this.testRepo.remove(test);
    return { success: true, message: 'Practice test successfully deleted' };
  }

  private async notifyStaffOnSubmission(user: User, test: Test) {
    try {
      const staff = await this.userRepository.find({
        where: { role: In(['admin', 'employee']) },
      });
      for (const member of staff) {
        const notification = new Notification();
        notification.message = `${user.name} (${user.userId}) submitted "${test.title}" — pending manual evaluation.`;
        notification.user = member;
        notification.actionLink = test.course
          ? `/dashboard/courses/${test.course.courseId}?tab=evaluation${
              test.lesson ? `&lesson=${test.lesson.id}` : ''
            }`
          : '/dashboard?tab=manage-courses';
        const savedNotif = await this.notificationRepo.save(notification);

        this.notificationsGateway.sendNotificationToUser(member.userId, {
          id: savedNotif.id,
          message: savedNotif.message,
          actionLink: savedNotif.actionLink,
          createdAt: savedNotif.createdAt,
          isRead: false,
        });
      }
    } catch (notifErr) {
      this.logger.error(
        `[Notification] Failed to notify staff for submission: ${(notifErr as any)?.message}`,
      );
    }
  }

  private buildCourseLessonLink(test: Test): string {
    const course = test?.course;
    const lesson = test?.lesson;
    if (course?.courseId) {
      return lesson?.id
        ? `/dashboard/learn/${course.courseId}?lesson=${lesson.id}`
        : `/dashboard/learn/${course.courseId}`;
    }
    return '/dashboard?tab=my-learning';
  }

  private async logAction(
    userId: string,
    action: string,
    targetType: string,
    targetName: string,
    targetId: string,
    details?: any,
    courseId?: string,
  ) {
    try {
      const actor = await this.userRepository.findOne({ where: { userId } });
      await this.activityLogsService.log({
        actorId: userId,
        actorName: actor?.name || userId,
        actorRole: actor?.role || 'unknown',
        action,
        targetType,
        targetName,
        targetId,
        courseId,
        details,
      });
    } catch (err: any) {
      this.logger.error(`[ActivityLog] Failed to log ${action}: ${err?.message}`);
    }
  }
}
