import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, IsNull, Not } from 'typeorm';
import { ExamGroup } from './entities/exam-group.entity';
import { ExamGroupQuestion } from './entities/exam-group-question.entity';
import { ExamGroupEnrollment } from './entities/exam-group-enrollment.entity';
import { ExamGroupSubmission } from './entities/exam-group-submission.entity';
import { ExamGroupAnswer } from './entities/exam-group-answer.entity';
import { User } from '../auth/entities/user.entity';
import { CreateExamGroupDto } from './dto/create-exam-group.dto';
import { UpdateExamGroupDto } from './dto/update-exam-group.dto';
import { AddQuestionsDto } from './dto/add-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { SubmitExamDto } from './dto/submit-exam.dto';
import { EvaluateExamGroupDto } from './dto/evaluate-exam-group.dto';

import { GeminiAnalysisService } from '../ai-evaluation/gemini-analysis.service';
import { CloudStorageService } from '../ai-evaluation/cloud-storage.service';
import { MediaProcessorService } from '../ai-evaluation/media-processor.service';
import { GeminiAiService } from '../ai-testing/gemini-ai.service';
import { Notification } from '../notifications/notification.entity';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TRASH_RETENTION_MS } from './trash-cleanup.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ExamGroupsService {
  constructor(
    @InjectRepository(ExamGroup)
    private readonly examGroupRepo: Repository<ExamGroup>,
    @InjectRepository(ExamGroupQuestion)
    private readonly questionRepo: Repository<ExamGroupQuestion>,
    @InjectRepository(ExamGroupEnrollment)
    private readonly enrollmentRepo: Repository<ExamGroupEnrollment>,
    @InjectRepository(ExamGroupSubmission)
    private readonly submissionRepo: Repository<ExamGroupSubmission>,
    @InjectRepository(ExamGroupAnswer)
    private readonly answerRepo: Repository<ExamGroupAnswer>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly geminiAnalysisService: GeminiAnalysisService,
    private readonly cloudStorageService: CloudStorageService,
    private readonly mediaProcessorService: MediaProcessorService,
    private readonly geminiAiService: GeminiAiService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  private async deleteFileSafely(fileUrl: string) {
    if (!fileUrl) return;
    try {
      const relativePath = fileUrl.startsWith('/') ? fileUrl.slice(1) : fileUrl;
      const absolutePath = path.join(process.cwd(), relativePath);
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
        console.log(`[File Cleanup] Deleted file: ${absolutePath}`);
      }
    } catch (err) {
      console.error(`[File Cleanup] Error deleting file: ${fileUrl}`, err);
    }
  }

  private async deleteVideoEvaluationAssets(submissionId: number) {
    try {
      const evaluationDir = path.join(
        process.cwd(),
        `uploads/VdoEva/submission_${submissionId}`,
      );
      if (fs.existsSync(evaluationDir)) {
        await fs.promises.rm(evaluationDir, {
          recursive: true,
          force: true,
        });
        console.log(
          `[File Cleanup] Deleted AI evaluation assets: ${evaluationDir}`,
        );
      }
    } catch (err) {
      console.error('[File Cleanup] Failed to delete AI evaluation assets:', err);
    }
  }

  private async deleteExamGroupFiles(examGroup: ExamGroup) {
    try {
      if (examGroup.thumbnailUrl) {
        await this.deleteFileSafely(examGroup.thumbnailUrl);
      }

      for (const q of examGroup.questions || []) {
        if (q.referenceScript) {
          await this.deleteFileSafely(q.referenceScript);
        }
      }

      for (const sub of examGroup.submissions || []) {
        const evaluationDir = path.join(
          process.cwd(),
          `uploads/VdoEva/submission_${sub.id}`,
        );
        if (fs.existsSync(evaluationDir)) {
          await fs.promises.rm(evaluationDir, { recursive: true, force: true });
          console.log(`[File Cleanup] Deleted directory: ${evaluationDir}`);
        }

        for (const ans of sub.answers || []) {
          if (ans.providedAnswer && Array.isArray(ans.providedAnswer)) {
            for (const file of ans.providedAnswer) {
              if (typeof file === 'string' && file.trim()) {
                if (file.startsWith('/uploads/') || file.startsWith('uploads/')) {
                  await this.deleteFileSafely(file);
                } else {
                  await this.deleteFileSafely(`/uploads/test-videos/${file}`);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[File Cleanup] Failed to delete exam group files:', err);
    }
  }

  private async logActivity(
    actorId: string,
    action: string,
    targetType: string,
    targetName: string,
    targetId: string,
    details?: any,
  ) {
    try {
      const actor = await this.userRepo.findOne({ where: { userId: actorId } });
      if (actor) {
        await this.activityLogsService.log({
          actorId,
          actorName: actor.name,
          actorRole: actor.role,
          action,
          targetType,
          targetName,
          targetId,
          details,
        });
      }
    } catch (err) {
      console.error('[ExamGroups] logActivity error:', err);
    }
  }

  private async generateNextExamGroupId(): Promise<string> {
    const last = await this.examGroupRepo.findOne({
      where: {},
      withDeleted: true,
      order: { id: 'DESC' },
    });
    if (!last) {
      return 'EXG-0001';
    }
    const match = last.examGroupId.match(/EXG-(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 1;
    return `EXG-${String(nextNum).padStart(4, '0')}`;
  }

  private async sendNotification(
    user: User,
    message: string,
    actionLink: string,
  ) {
    try {
      const notification = this.notificationRepo.create({
        message,
        user,
        actionLink,
      });
      const saved = await this.notificationRepo.save(notification);
      this.notificationsGateway.sendNotificationToUser(user.userId, {
        id: saved.id,
        message: saved.message,
        actionLink: saved.actionLink,
        createdAt: saved.createdAt,
        isRead: false,
      });
    } catch (err: any) {
      console.error(`[ExamGroup] Failed to send notification: ${err?.message}`);
    }
  }

  private async notifyStudentsAboutNewExam(examGroup: ExamGroup) {
    try {
      const students = await this.userRepo.find({
        where: { role: 'user' },
      });
      if (students.length === 0) return;

      const notifications = students.map((student) =>
        this.notificationRepo.create({
          message: `New test "${examGroup.title}" is now available. Take it now.`,
          user: student,
          actionLink: `/exams/${examGroup.id}`,
        }),
      );
      const saved = await this.notificationRepo.save(notifications);

      for (let i = 0; i < students.length; i++) {
        const notif = saved[i];
        if (!notif) continue;
        this.notificationsGateway.sendNotificationToUser(students[i].userId, {
          id: notif.id,
          message: notif.message,
          actionLink: notif.actionLink,
          createdAt: notif.createdAt,
          isRead: false,
        });
      }
    } catch (err: any) {
      console.error(
        `[ExamGroup] Failed to notify students about new exam: ${err?.message}`,
      );
    }
  }

  async createExamGroup(dto: CreateExamGroupDto, actorId: string): Promise<ExamGroup> {
    const examGroup = this.examGroupRepo.create({});

    const nextId = await this.generateNextExamGroupId();
    examGroup.examGroupId = nextId;
    examGroup.title = dto.title;
    examGroup.description = dto.description ?? null;
    examGroup.thumbnailUrl = dto.thumbnailUrl ?? null;
    examGroup.status = dto.status || 'draft';
    examGroup.totalStudents = 0;

    if (dto.startTime) {
      examGroup.startTime = new Date(dto.startTime);
    }
    if (dto.endTime) {
      examGroup.endTime = new Date(dto.endTime);
    }
    if (dto.timePerQuestion !== undefined) {
      examGroup.timePerQuestion = dto.timePerQuestion;
    }

    const saved = await this.examGroupRepo.save(examGroup);

    if (saved.status === 'active') {
      await this.notifyStudentsAboutNewExam(saved);
    }

    await this.logActivity(
      actorId,
      'EXAM_CREATED',
      'ExamGroup',
      saved.title,
      saved.examGroupId,
      { id: saved.id, title: saved.title },
    );

    return saved;
  }

  async getExamGroupsPaginated(
    page: number = 1,
    limit: number = 10,
    q?: string,
    status?: string,
    role?: string,
    userId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{ data: any[]; meta: any }> {
    const skippedItems = (page - 1) * limit;

    const where: any = {};
    if (role === 'user') {
      where.status = 'active';
      // User can browse all active exams to join them
    } else {
      if (status) {
        where.status = status;
      }
    }

    if (q) {
      where.title = ILike(`%${q}%`);
    }

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        where.startTime.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        where.startTime.lte = end;
      }
    }

    const [examGroups, total] = await Promise.all([
      this.examGroupRepo.find({
        where,
        skip: skippedItems,
        take: limit,
        relations: {
          questions: true,
          enrollments: { user: true },
        },
        select: {
          id: true,
          examGroupId: true,
          title: true,
          description: true,
          thumbnailUrl: true,
          status: true,
          startTime: true,
          endTime: true,
          timePerQuestion: true,
          totalStudents: true,
          createdAt: true,
          updatedAt: true,
          enrollments: {
            id: true,
            user: { userId: true },
          },
          questions: { id: true },
        },
        order: {
          createdAt: 'DESC',
          id: 'DESC',
        },
      }),
      this.examGroupRepo.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: examGroups,
      meta: {
        totalItems: total,
        itemCount: examGroups.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  async getExamGroupById(
    id: number,
    requesterRole?: string,
    requesterUserId?: string,
  ): Promise<any> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id },
      relations: {
        questions: true,
        enrollments: { user: true },
      },
    });

    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }

    const isStudent = requesterRole === 'user';
    if (isStudent) {
      if (examGroup.status !== 'active') {
        return {
          id: examGroup.id,
          examGroupId: examGroup.examGroupId,
          title: examGroup.title,
          description: examGroup.description,
          thumbnailUrl: examGroup.thumbnailUrl,
          status: examGroup.status,
          startTime: examGroup.startTime,
          endTime: examGroup.endTime,
          timePerQuestion: examGroup.timePerQuestion,
          totalStudents: examGroup.totalStudents,
          totalQuestions: examGroup.questions?.length || 0,
        };
      }
    }

    return examGroup;
  }

  async updateExamGroup(
    id: number,
    dto: UpdateExamGroupDto,
    actorId: string,
  ): Promise<ExamGroup> {
    const examGroup = await this.examGroupRepo.findOne({ where: { id } });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }

    const oldStatus = examGroup.status;
    const changedFields: string[] = [];

    if (dto.title !== undefined && dto.title !== examGroup.title) {
      changedFields.push('title');
      examGroup.title = dto.title;
    }
    if (dto.description !== undefined && dto.description !== examGroup.description) {
      changedFields.push('description');
      examGroup.description = dto.description ?? null;
    }
    if (dto.thumbnailUrl !== undefined && dto.thumbnailUrl !== examGroup.thumbnailUrl) {
      changedFields.push('thumbnailUrl');
      examGroup.thumbnailUrl = dto.thumbnailUrl ?? null;
    }
    if (dto.status !== undefined && dto.status !== examGroup.status) {
      changedFields.push('status');
      examGroup.status = dto.status;
    }
    if (dto.startTime !== undefined) {
      const oldTime = examGroup.startTime ? new Date(examGroup.startTime).getTime() : null;
      const newTime = dto.startTime ? new Date(dto.startTime).getTime() : null;
      if (oldTime !== newTime) {
        changedFields.push('startTime');
        examGroup.startTime = dto.startTime ? new Date(dto.startTime) : null;
      }
    }
    if (dto.endTime !== undefined) {
      const oldTime = examGroup.endTime ? new Date(examGroup.endTime).getTime() : null;
      const newTime = dto.endTime ? new Date(dto.endTime).getTime() : null;
      if (oldTime !== newTime) {
        changedFields.push('endTime');
        examGroup.endTime = dto.endTime ? new Date(dto.endTime) : null;
      }
    }
    if (dto.timePerQuestion !== undefined && dto.timePerQuestion !== examGroup.timePerQuestion) {
      changedFields.push('timePerQuestion');
      examGroup.timePerQuestion = dto.timePerQuestion;
    }

    const saved = await this.examGroupRepo.save(examGroup);

    if (oldStatus !== 'active' && saved.status === 'active') {
      await this.notifyStudentsAboutNewExam(saved);
    }

    // Only log if something actually changed!
    if (changedFields.length > 0) {
      await this.logActivity(
        actorId,
        'EXAM_UPDATED',
        'ExamGroup',
        saved.title,
        saved.examGroupId,
        { id: saved.id, changedFields },
      );
    }

    return saved;
  }

  async deleteExamGroup(
    id: number,
    actorId: string,
  ): Promise<{ success: boolean; message: string }> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }
    if (examGroup.deletedAt) {
      return {
        success: true,
        message: 'Exam group is already in the recycle bin',
      };
    }
    await this.examGroupRepo.softDelete({ id });

    await this.logActivity(
      actorId,
      'EXAM_DELETED',
      'ExamGroup',
      examGroup.title,
      examGroup.examGroupId,
      { id: examGroup.id },
    );

    return {
      success: true,
      message: 'Exam group moved to recycle bin',
    };
  }

  async getTrashItems(
    requesterId: string,
    q?: string,
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ): Promise<any[]> {
    const requester = await this.userRepo.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can view the recycle bin',
      );
    }

    const query = this.examGroupRepo
      .createQueryBuilder('eg')
      .withDeleted()
      .where('eg.deletedAt IS NOT NULL');

    if (q) {
      query.andWhere(
        '(eg.title ILike :q OR eg.examGroupId ILike :q)',
        { q: `%${q}%` },
      );
    }

    query.orderBy('eg.deletedAt', sortOrder);

    const items = await query.getMany();
    return items.map((eg) => ({
      id: eg.id,
      examGroupId: eg.examGroupId,
      title: eg.title,
      status: eg.status,
      deletedAt: eg.deletedAt,
      purgeAt: eg.deletedAt
        ? new Date(eg.deletedAt.getTime() + TRASH_RETENTION_MS)
        : null,
      remainingSeconds: eg.deletedAt
        ? Math.max(
            0,
            Math.ceil(
              (eg.deletedAt.getTime() + TRASH_RETENTION_MS - Date.now()) / 1000,
            ),
          )
        : 0,
    }));
  }

  async restoreExamGroup(
    id: number,
    actorId: string,
  ): Promise<{ success: boolean; message: string }> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }
    if (!examGroup.deletedAt) {
      throw new BadRequestException(
        'This exam group is not in the recycle bin',
      );
    }
    await this.examGroupRepo.restore({ id });

    await this.logActivity(
      actorId,
      'EXAM_RESTORED',
      'ExamGroup',
      examGroup.title,
      examGroup.examGroupId,
      { id: examGroup.id },
    );

    return { success: true, message: 'Exam group restored successfully' };
  }

  async permanentlyDeleteExamGroup(
    id: number,
    actorId: string,
  ): Promise<{ success: boolean; message: string }> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id },
      relations: {
        questions: true,
        submissions: {
          answers: true,
        },
      },
      withDeleted: true,
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }
    if (!examGroup.deletedAt) {
      throw new BadRequestException(
        'Only items in the recycle bin can be permanently deleted',
      );
    }

    await this.deleteExamGroupFiles(examGroup);

    await this.examGroupRepo
      .createQueryBuilder()
      .delete()
      .from(ExamGroup)
      .where('id = :id', { id })
      .execute();

    await this.logActivity(
      actorId,
      'EXAM_PERMANENTLY_DELETED',
      'ExamGroup',
      examGroup.title,
      examGroup.examGroupId,
      { id: examGroup.id },
    );

    return {
      success: true,
      message: 'Exam group permanently deleted',
    };
  }

  async emptyRecycleBin(requesterId: string): Promise<{ message: string }> {
    const requester = await this.userRepo.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can empty the recycle bin',
      );
    }

    const trashItems = await this.examGroupRepo.find({
      where: { deletedAt: Not(IsNull()) },
      relations: {
        questions: true,
        submissions: {
          answers: true,
        },
      },
      withDeleted: true,
    });

    for (const item of trashItems) {
      await this.deleteExamGroupFiles(item);
    }

    await this.examGroupRepo
      .createQueryBuilder()
      .delete()
      .from(ExamGroup)
      .where('deletedAt IS NOT NULL')
      .execute();

    await this.logActivity(
      requesterId,
      'RECYCLE_BIN_EMPTIED',
      'ExamGroup',
      'All Recycle Bin Items',
      'BULK_DELETE',
      { deletedCount: trashItems.length },
    );

    return {
      message:
        trashItems.length > 0
          ? `Recycle bin emptied (${trashItems.length} exam group(s) permanently deleted)`
          : 'Recycle bin is already empty',
    };
  }

  async addQuestions(
    examGroupId: number,
    dto: AddQuestionsDto,
  ): Promise<ExamGroupQuestion[]> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id: examGroupId },
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }

    const existingVideos = await this.questionRepo.count({
      where: { examGroup: { id: examGroupId }, type: 'Video' },
    });
    const newVideos = dto.questions.filter((q) => (q.type || 'MCQ') === 'Video').length;
    if (existingVideos + newVideos > 1) {
      throw new BadRequestException(
        'Only one Video question is allowed per exam.',
      );
    }

    for (const q of dto.questions) {
      const type = q.type || 'MCQ';
      const evaluationType = q.evaluationType || 'AI';
      if (
        (type === 'CQ' || type === 'Video') &&
        evaluationType === 'AI' &&
        !q.referenceScript
      ) {
        throw new BadRequestException(
          `A reference document is required for AI-evaluated ${type === 'CQ' ? 'creative' : 'video'} questions.`,
        );
      }
    }

    const questions = dto.questions.map((q) => {
      const question = this.questionRepo.create({
        questionText: q.questionText,
        type: q.type || 'MCQ',
        options: q.options || [],
        correctAnswers: q.correctAnswers || [],
        marks: Number(q.marks),
        accuracyMarks: q.accuracyMarks ? Number(q.accuracyMarks) : undefined,
        evaluationType: q.evaluationType || 'AI',
        referenceScript: q.referenceScript,
        isMultipleAnswer: q.isMultipleAnswer === true,
        examGroup,
      });
      return question;
    });

    return this.questionRepo.save(questions);
  }

  async removeQuestion(
    examGroupId: number,
    questionId: number,
  ): Promise<{ success: boolean; message: string }> {
    const question = await this.questionRepo.findOne({
      where: { id: questionId, examGroup: { id: examGroupId } },
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    await this.questionRepo.remove(question);
    return { success: true, message: 'Question removed successfully' };
  }

  async updateQuestion(
    examGroupId: number,
    questionId: number,
    dto: UpdateQuestionDto,
  ): Promise<ExamGroupQuestion> {
    const question = await this.questionRepo.findOne({
      where: { id: questionId, examGroup: { id: examGroupId } },
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (dto.questionText !== undefined)
      question.questionText = dto.questionText;
    if (dto.type !== undefined) question.type = dto.type;
    if (dto.options !== undefined) question.options = dto.options;
    if (dto.correctAnswers !== undefined)
      question.correctAnswers = dto.correctAnswers;
    if (dto.marks !== undefined) question.marks = Number(dto.marks);
    if (dto.accuracyMarks !== undefined)
      question.accuracyMarks = Number(dto.accuracyMarks);
    if (dto.evaluationType !== undefined)
      question.evaluationType = dto.evaluationType;
    if (dto.referenceScript !== undefined)
      question.referenceScript = dto.referenceScript;
    if (dto.isMultipleAnswer !== undefined)
      question.isMultipleAnswer = dto.isMultipleAnswer === true;

    const type = question.type || 'MCQ';
    const evaluationType = question.evaluationType || 'AI';
    if (
      (type === 'CQ' || type === 'Video') &&
      evaluationType === 'AI' &&
      !question.referenceScript
    ) {
      throw new BadRequestException(
        `A reference document is required for AI-evaluated ${type === 'CQ' ? 'creative' : 'video'} questions.`,
      );
    }

    return this.questionRepo.save(question);
  }

  async enrollUser(
    examGroupId: number,
    targetUserId: string,
  ): Promise<ExamGroupEnrollment> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id: examGroupId },
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }

    const user = await this.userRepo.findOne({
      where: { userId: targetUserId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.enrollmentRepo.findOne({
      where: { user: { id: user.id }, examGroup: { id: examGroupId } },
    });
    if (existing) {
      throw new ConflictException(
        'User is already enrolled in this exam group',
      );
    }

    const enrollment = this.enrollmentRepo.create({
      user,
      examGroup,
    });

    const saved = await this.enrollmentRepo.save(enrollment);
    examGroup.totalStudents = await this.enrollmentRepo.count({
      where: { examGroup: { id: examGroupId } },
    });
    await this.examGroupRepo.save(examGroup);

    return saved;
  }

  async removeEnrollment(
    examGroupId: number,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const enrollment = await this.enrollmentRepo.findOne({
      where: { user: { id: user.id }, examGroup: { id: examGroupId } },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    await this.enrollmentRepo.remove(enrollment);

    const examGroup = await this.examGroupRepo.findOne({
      where: { id: examGroupId },
    });
    if (examGroup) {
      examGroup.totalStudents = await this.enrollmentRepo.count({
        where: { examGroup: { id: examGroupId } },
      });
      await this.examGroupRepo.save(examGroup);
    }

    return { success: true, message: 'Enrollment removed successfully' };
  }

  async joinExam(
    examGroupId: number,
    userId: string,
  ): Promise<ExamGroupEnrollment> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id: examGroupId },
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }
    if (examGroup.status !== 'active') {
      throw new BadRequestException('This exam is not active');
    }
    const now = new Date();
    if (examGroup.startTime && now < examGroup.startTime) {
      throw new BadRequestException('Exam has not started yet');
    }
    if (examGroup.endTime && now > examGroup.endTime) {
      throw new BadRequestException('Exam has ended');
    }

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.enrollmentRepo.findOne({
      where: { user: { id: user.id }, examGroup: { id: examGroupId } },
    });
    if (existing) {
      throw new ConflictException('You are already enrolled in this exam');
    }

    const enrollment = this.enrollmentRepo.create({
      user,
      examGroup,
    });

    const saved = await this.enrollmentRepo.save(enrollment);
    examGroup.totalStudents = await this.enrollmentRepo.count({
      where: { examGroup: { id: examGroupId } },
    });
    await this.examGroupRepo.save(examGroup);

    return saved;
  }

  async submitExam(
    examGroupId: number,
    userId: string,
    dto: SubmitExamDto,
  ): Promise<ExamGroupSubmission> {
    const examGroup = await this.examGroupRepo.findOne({
      where: { id: examGroupId },
      relations: { questions: true },
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }

    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingSubmission = await this.submissionRepo.findOne({
      where: { user: { id: user.id }, examGroup: { id: examGroupId } },
    });
    if (existingSubmission) {
      throw new ConflictException('You have already submitted this exam');
    }

    const now = new Date();
    if (examGroup.endTime && now > examGroup.endTime) {
      throw new BadRequestException('Exam has ended, submission not accepted');
    }

    let marksObtained = 0;
    let pendingCount = 0;
    const aiVideoAnswers: any[] = [];
    const aiCqAnswers: any[] = [];

    const answers: Partial<ExamGroupAnswer>[] = dto.answers
      .map((answerDto) => {
        const question = examGroup.questions.find(
          (q) => q.id === answerDto.questionId,
        );
        if (!question) return null;

        const providedArr = answerDto.providedAnswer || [];
        let awarded = 0;

        if (question.type === 'MCQ') {
          const correctArr = question.correctAnswers || [];
          let isCorrect = false;
          if (question.isMultipleAnswer) {
            // All-or-nothing: student must select exactly the full correct set
            isCorrect =
              providedArr.length > 0 &&
              providedArr.length === correctArr.length &&
              correctArr.every((c) => providedArr.includes(c));
          } else {
            // Single answer: exactly one option must match
            isCorrect =
              providedArr.length === 1 &&
              correctArr.length === 1 &&
              providedArr[0] === correctArr[0];
          }
          awarded = isCorrect ? question.marks : 0;
          marksObtained += awarded;
        } else {
          pendingCount++;
          if (question.type === 'Video' && question.evaluationType === 'AI') {
            aiVideoAnswers.push({
              questionId: question.id,
              providedArr,
              question,
            });
          } else if (
            question.type === 'CQ' &&
            question.evaluationType === 'AI'
          ) {
            aiCqAnswers.push({
              questionId: question.id,
              providedArr,
              question,
            });
          }
        }

        return {
          providedAnswer: providedArr,
          marksAwarded: awarded,
          question: { id: question.id } as ExamGroupQuestion,
        };
      })
      .filter((a) => a !== null);

    const submission = this.submissionRepo.create({
      user,
      examGroup,
      marksObtained,
      status: pendingCount > 0 ? 'Pending Evaluation' : 'Evaluated',
      submittedAt: now,
    });

    const savedSubmission = await this.submissionRepo.save(submission);

    if (answers.length > 0) {
      const answerEntities = this.answerRepo.create(
        answers.map((a) => ({
          ...a,
          submission: { id: savedSubmission.id } as ExamGroupSubmission,
        })),
      );
      await this.answerRepo.save(answerEntities);
    }

    if (pendingCount === 0) {
      await this.sendNotification(
        user,
        `Your evaluation for "${examGroup.title}" is complete. Your final score is ${marksObtained}.`,
        `/results/${examGroup.id}`,
      );
    }

    // Trigger AI Evaluation for Video questions
    const totalVideoAnswers = aiVideoAnswers.length;
    let completedVideoEvaluations = 0;

    for (const aiAnswer of aiVideoAnswers) {
      let filename = aiAnswer.providedArr[0] || '';
      if (filename.includes('/')) {
        filename = filename.split('/').pop();
      }

      this.mediaProcessorService
        .processVideoAssets(filename, savedSubmission.id)
        .then(async (assets) => {
          console.log(
            `[ExamGroup] Media extracted for sub-${savedSubmission.id}`,
          );
          try {
            const audioDest = `evaluations/exg_submission_${savedSubmission.id}/audio/extracted_audio.mp3`;
            const [audioGcsUri, snapshotGcsUris] = await Promise.all([
              this.cloudStorageService.uploadFile(assets.audioPath, audioDest),
              this.cloudStorageService.uploadSnapshots(
                assets.snapshotDir,
                savedSubmission.id,
              ),
            ]);

            const evaluationResult =
              await this.geminiAnalysisService.evaluateCandidate(
                audioGcsUri,
                snapshotGcsUris,
                '',
                'text/plain',
                aiAnswer.question.accuracyMarks ||
                  aiAnswer.question.marks ||
                  0,
                aiAnswer.question.questionText,
              );

            const savedSubAnswer = await this.answerRepo.findOne({
              where: {
                submission: { id: savedSubmission.id },
                question: { id: aiAnswer.questionId },
              },
            });

            if (savedSubAnswer) {
              await this.answerRepo.update(savedSubAnswer.id, {
                marksAwarded: evaluationResult.overallScore,
                evaluatorComment: JSON.stringify(evaluationResult),
                evaluatedBy: 'AI',
              });

              // Check if any other answers are still pending (for simplicity here, we leave status update to manual evaluation for mixed types, but we'll add the marks)
              const subToUpdate = await this.submissionRepo.findOne({
                where: { id: savedSubmission.id },
              });
              if (subToUpdate) {
                const newMarks =
                  subToUpdate.marksObtained + evaluationResult.overallScore;
                await this.submissionRepo.update(savedSubmission.id, {
                  marksObtained: newMarks,
                });
              }

              await this.finalizeSubmissionIfComplete(savedSubmission.id);
            }
          } catch (e) {
            console.error('[ExamGroup AI Error]', e);
            await this.markAiEvaluationFailed(
              savedSubmission.id,
              aiAnswer.questionId,
            );
          }
        })
        .catch(async (e) => {
          console.error('[ExamGroup AI Media Error]', e);
          await this.markAiEvaluationFailed(
            savedSubmission.id,
            aiAnswer.questionId,
          );
        })
        .finally(async () => {
          completedVideoEvaluations++;
          if (completedVideoEvaluations === totalVideoAnswers) {
            await this.deleteVideoEvaluationAssets(savedSubmission.id);
          }
        });
    }

    // Trigger AI Evaluation for CQ questions (text answers)
    for (const aiCqAnswer of aiCqAnswers) {
      const learnerAnswer = aiCqAnswer.providedArr[0] || '';
      const referenceText =
        aiCqAnswer.question.referenceScript ||
        (aiCqAnswer.question.correctAnswers || []).join('\n');

      this.geminiAiService
        .evaluateCqAnswer(
          null,
          aiCqAnswer.question.questionText,
          learnerAnswer,
          aiCqAnswer.question.marks || 2,
          referenceText,
        )
        .then(async ({ marksAwarded, feedback }) => {
          const savedSubAnswer = await this.answerRepo.findOne({
            where: {
              submission: { id: savedSubmission.id },
              question: { id: aiCqAnswer.questionId },
            },
          });

          if (savedSubAnswer) {
            await this.answerRepo.update(savedSubAnswer.id, {
              marksAwarded,
              evaluatorComment: feedback,
              evaluatedBy: 'AI',
            });

            const subToUpdate = await this.submissionRepo.findOne({
              where: { id: savedSubmission.id },
            });
            if (subToUpdate) {
              const newMarks = subToUpdate.marksObtained + marksAwarded;
              await this.submissionRepo.update(savedSubmission.id, {
                marksObtained: newMarks,
              });
            }

            await this.finalizeSubmissionIfComplete(savedSubmission.id);
          }
        })
        .catch(async (err) => {
          console.error('[ExamGroup CQ AI Error]', err);
          await this.markAiEvaluationFailed(
            savedSubmission.id,
            aiCqAnswer.questionId,
          );
        });
    }

    return savedSubmission;
  }

  private async finalizeSubmissionIfComplete(submissionId: number) {
    try {
      const sub = await this.submissionRepo.findOne({
        where: { id: submissionId },
        relations: { answers: { question: true }, user: true, examGroup: true },
      });
      if (!sub || sub.status === 'Evaluated') return;

      const hasPending = (sub.answers || []).some(
        (a) => !a.evaluatedBy && a.question?.type !== 'MCQ',
      );
      if (!hasPending) {
        const totalMarks = (sub.answers || []).reduce(
          (sum, ans) => sum + (ans.marksAwarded || 0),
          0,
        );
        const studentVisibleTotal = (sub.answers || [])
          .filter((ans) => ans.question?.type !== 'Video')
          .reduce((sum, ans) => sum + (ans.marksAwarded || 0), 0);

        await this.submissionRepo.update(submissionId, {
          status: 'Evaluated',
          marksObtained: totalMarks,
        });

        if (sub.user && sub.examGroup) {
          await this.sendNotification(
            sub.user,
            `Your evaluation for "${sub.examGroup.title}" is complete. Your final score is ${studentVisibleTotal}.`,
            `/results/${sub.examGroup.id}`,
          );
        }
      }
    } catch (err: any) {
      console.error('[ExamGroup] finalizeSubmissionIfComplete error:', err);
    }
  }

  private async markAiEvaluationFailed(
    submissionId: number,
    questionId: number,
  ) {
    try {
      const savedSubAnswer = await this.answerRepo.findOne({
        where: { submission: { id: submissionId }, question: { id: questionId } },
      });
      if (!savedSubAnswer) return;

      await this.answerRepo.update(savedSubAnswer.id, {
        evaluatedBy: null,
        marksAwarded: 0,
        evaluatorComment: '__AI_FAILED__',
      });

      console.error(
        `[ExamGroup] AI evaluation failed for submission ${submissionId}, question ${questionId}. Flagged for manual review.`,
      );
    } catch (err: any) {
      console.error('[ExamGroup] markAiEvaluationFailed error:', err);
    }
  }

  async getMySubmissions(
    examGroupId: number,
    userId: string,
  ): Promise<any[]> {
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const submissions = await this.submissionRepo.find({
      where: { examGroup: { id: examGroupId }, user: { id: user.id } },
      relations: { answers: { question: true } },
      order: { createdAt: 'DESC' },
    });

    // Add studentVisibleMarks: sum of MCQ + CQ marks only (excludes Video marks)
    return submissions.map((sub) => {
      const studentVisibleMarks = (sub.answers || [])
        .filter((ans) => ans.question?.type !== 'Video')
        .reduce((sum, ans) => sum + (ans.marksAwarded || 0), 0);

      const studentVisibleTotal = (sub.answers || [])
        .filter((ans) => ans.question?.type !== 'Video')
        .reduce((sum, ans) => sum + (ans.question?.marks || 0), 0);

      return {
        ...sub,
        studentVisibleMarks,
        studentVisibleTotal,
      };
    });
  }

  async getAllSubmissions(examGroupId: number): Promise<ExamGroupSubmission[]> {
    return this.submissionRepo.find({
      where: { examGroup: { id: examGroupId } },
      relations: { user: true, answers: { question: true } },
      order: { createdAt: 'DESC' },
    });
  }

  async getRemainingCount(examGroupId: number): Promise<{
    remaining: number;
    totalEnrolled: number;
    totalSubmitted: number;
  }> {
    const totalEnrolled = await this.enrollmentRepo.count({
      where: { examGroup: { id: examGroupId } },
    });
    const submittedUsers = await this.submissionRepo
      .createQueryBuilder('submission')
      .select('DISTINCT submission.userId')
      .where('submission.examGroupId = :examGroupId', { examGroupId })
      .getRawMany();

    const totalSubmitted = submittedUsers.length;
    const remaining = Math.max(0, totalEnrolled - totalSubmitted);

    return { remaining, totalEnrolled, totalSubmitted };
  }

  async evaluateSubmission(
    examGroupId: number,
    evaluatorUserId: string,
    dto: EvaluateExamGroupDto,
  ): Promise<{ message: string }> {
    const submission = await this.submissionRepo.findOne({
      where: { id: dto.submissionId, examGroup: { id: examGroupId } },
      relations: { answers: { question: true }, user: true },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found in this exam group');
    }

    let marksAdded = 0;
    let visibleMarksAdded = 0;

    for (const evalItem of dto.evaluations) {
      const answer = await this.answerRepo.findOne({
        where: { id: evalItem.answerId, submission: { id: submission.id } },
        relations: { question: true },
      });

      if (answer) {
        // Find difference to adjust total score accurately
        const marksAwardedNum = Number(evalItem.marksAwarded);
        const marksDiff = marksAwardedNum - (answer.marksAwarded || 0);
        marksAdded += marksDiff;
        if (answer.question?.type !== 'Video') {
          visibleMarksAdded += marksDiff;
        }

        const isUpdate = answer.evaluatedBy === 'Human';
        const comment =
          evalItem.evaluatorComment ||
          (answer.evaluatorComment?.startsWith?.('__AI_FAILED__')
            ? ''
            : answer.evaluatorComment);

        await this.answerRepo.update(answer.id, {
          marksAwarded: marksAwardedNum,
          evaluatorComment: comment,
          evaluatedBy: 'Human',
        });

        await this.logActivity(
          evaluatorUserId,
          isUpdate ? 'MARK_UPDATED_MANUALLY' : 'MARK_UPLOADED_MANUALLY',
          'ExamGroupQuestion',
          answer.question?.questionText || `Answer #${answer.id}`,
          String(answer.question?.id || answer.id),
          {
            submissionId: submission.id,
            studentId: submission.user?.userId,
            studentName: submission.user?.name,
            previousMarks: answer.marksAwarded,
            newMarks: marksAwardedNum,
          },
        );
      }
    }

    // Update total marks and status
    const newTotal = Math.max(0, submission.marksObtained + marksAdded);

    // Check if fully evaluated (all non-MCQ answers have been evaluated)
    // For simplicity, we just mark as Evaluated if admin submits evaluation
    await this.submissionRepo.update(submission.id, {
      marksObtained: newTotal,
      status: 'Evaluated',
    });

    const examGroup = await this.examGroupRepo.findOne({
      where: { id: examGroupId },
    });
    if (examGroup && submission.user) {
      const student = await this.userRepo.findOne({
        where: { id: submission.user.id },
      });
      if (student) {
        const visibleTotalBase = (submission.answers || [])
          .filter((ans) => ans.question?.type !== 'Video')
          .reduce((sum, ans) => sum + (ans.marksAwarded || 0), 0);
        const visibleTotal = Math.max(0, visibleTotalBase + visibleMarksAdded);
        await this.sendNotification(
          student,
          `Your marks for "${examGroup.title}" have been updated to ${visibleTotal}.`,
          `/results/${examGroup.id}`,
        );
      }
    }

    return { message: 'Evaluation submitted successfully' };
  }
}
