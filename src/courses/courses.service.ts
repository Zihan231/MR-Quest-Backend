import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Like,
  LessThan,
  MoreThanOrEqual,
  ILike,
  Not,
  IsNull,
} from 'typeorm';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { Category } from './entities/category.entity';
import { Enrollment } from './entities/enrollment.entity';
import { User } from '../auth/entities/user.entity';
import { TestSubmission } from './entities/test-submission.entity';
import { Test } from './entities/test.entity';
import { Notification } from './entities/notification.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { NotificationsGateway } from './notifications.gateway';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TestSubmission)
    private readonly testSubmissionRepository: Repository<TestSubmission>,
    @InjectRepository(Test)
    private readonly testRepository: Repository<Test>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

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

  private deletePhysicalFile(materialLink: string) {
    if (materialLink && materialLink.startsWith('/uploads/')) {
      const filePath = join(process.cwd(), materialLink);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        this.logger.error(`Failed to delete physical file: ${filePath}`, err);
      }
    }
  }

  private async cleanupPhysicalFilesForLesson(lessonId: number) {
    const lesson = await this.lessonRepository.findOne({
      where: { id: lessonId },
      withDeleted: true,
      relations: {
        tests: {
          questions: true,
          submissions: {
            answers: true,
          },
        },
      },
    });
    if (!lesson) return;
    if (lesson.materialLink) this.deletePhysicalFile(lesson.materialLink);

    for (const test of lesson.tests || []) {
      if (test.referenceScript) this.deletePhysicalFile(test.referenceScript);
      for (const q of test.questions || []) {
        if (q.referenceScript) this.deletePhysicalFile(q.referenceScript);
      }
      for (const submission of test.submissions || []) {
        for (const answer of submission.answers || []) {
          if (
            typeof answer.providedAnswer === 'string' &&
            answer.providedAnswer.startsWith('/uploads/')
          ) {
            this.deletePhysicalFile(answer.providedAnswer);
          }
        }
      }
    }
  }

  private async cleanupPhysicalFilesForCourse(courseId: number) {
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
      withDeleted: true,
      relations: {
        lessons: {
          tests: {
            questions: true,
            submissions: {
              answers: true,
            },
          },
        },
        tests: {
          questions: true,
          submissions: {
            answers: true,
          },
        },
      },
    });
    if (!course) return;

    if (course.thumbnailUrl) {
      this.deletePhysicalFile(course.thumbnailUrl);
    }

    for (const lesson of course.lessons || []) {
      if (lesson.materialLink) this.deletePhysicalFile(lesson.materialLink);
      for (const test of lesson.tests || []) {
        if (test.referenceScript) this.deletePhysicalFile(test.referenceScript);
        for (const q of test.questions || []) {
          if (q.referenceScript) this.deletePhysicalFile(q.referenceScript);
        }
        for (const submission of test.submissions || []) {
          for (const answer of submission.answers || []) {
            if (
              typeof answer.providedAnswer === 'string' &&
              answer.providedAnswer.startsWith('/uploads/')
            ) {
              this.deletePhysicalFile(answer.providedAnswer);
            }
          }
        }
      }
    }

    for (const test of course.tests || []) {
      if (test.referenceScript) this.deletePhysicalFile(test.referenceScript);
      for (const q of test.questions || []) {
        if (q.referenceScript) this.deletePhysicalFile(q.referenceScript);
      }
      for (const submission of test.submissions || []) {
        for (const answer of submission.answers || []) {
          if (
            typeof answer.providedAnswer === 'string' &&
            answer.providedAnswer.startsWith('/uploads/')
          ) {
            this.deletePhysicalFile(answer.providedAnswer);
          }
        }
      }
    }
  }

  private async generateNextCourseId(): Promise<string> {
    const lastCourse = await this.courseRepository.findOne({
      where: {},
      withDeleted: true,
      order: { id: 'DESC' },
    });
    if (!lastCourse) {
      return 'CRS-0001';
    }
    const match = lastCourse.courseId.match(/CRS-(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 1;
    return `CRS-${String(nextNum).padStart(4, '0')}`;
  }

  private async generateNextLessonId(): Promise<string> {
    const lastLesson = await this.lessonRepository.findOne({
      where: {},
      withDeleted: true,
      order: { id: 'DESC' },
    });
    if (!lastLesson) {
      return 'LES-0001';
    }
    const match = lastLesson.lessonId.match(/LES-(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 1;
    return `LES-${String(nextNum).padStart(4, '0')}`;
  }

  // --- Category Logic ---
  async getAllCategories(): Promise<Category[]> {
    return this.categoryRepository.find();
  }

  async createCategory(
    createCategoryDto: CreateCategoryDto,
    requesterId: string,
  ): Promise<Category> {
    const existing = await this.categoryRepository.findOne({
      where: { name: createCategoryDto.name },
    });
    if (existing) {
      return existing;
    }
    const cat = this.categoryRepository.create(createCategoryDto);
    const saved = await this.categoryRepository.save(cat);

    await this.logAction(
      requesterId,
      'CATEGORY_CREATED',
      'Category',
      saved.name,
      String(saved.id),
      { categoryId: saved.id, name: saved.name },
    );

    return saved;
  }

  async deleteCategory(
    id: number,
    requesterId: string,
  ): Promise<{ success: boolean; message: string }> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    // TypeORM should handle cascading or setting null depending on the relation if configured.
    // If we want to prevent deletion when courses exist:
    const coursesCount = await this.courseRepository.count({
      where: { category: { id } },
    });
    if (coursesCount > 0) {
      throw new ConflictException(
        'Cannot delete category because it is being used by existing courses.',
      );
    }
    const name = category.name;
    await this.categoryRepository.remove(category);

    await this.logAction(
      requesterId,
      'CATEGORY_DELETED',
      'Category',
      name,
      String(id),
      { categoryId: id, name },
    );

    return { success: true, message: 'Category deleted successfully' };
  }

  // --- Course Logic ---
  private calculateOverallCompletionRate(course: Course): number {
    if (!course.enrollments || course.enrollments.length === 0) {
      return 0;
    }
    const totalProgress = course.enrollments.reduce(
      (sum, enrollment) => sum + enrollment.progress,
      0,
    );
    return Math.round((totalProgress / course.enrollments.length) * 100) / 100;
  }

  async getAllCourses(): Promise<Course[]> {
    const courses = await this.courseRepository.find({
      relations: {
        category: true,
        lessons: true,
        enrollments: true,
      },
    });

    return courses.map((course) => {
      course.completionRate = this.calculateOverallCompletionRate(course);
      return course;
    });
  }

  async getCoursesPaginated(
    page: number = 1,
    limit: number = 6,
    categoryId?: number,
    status?: string,
    q?: string,
  ): Promise<{ data: any[]; meta: any }> {
    const skippedItems = (page - 1) * limit;

    let where: any;
    if (q) {
      // Search matches name OR courseId, combined with category and status filters
      where = [
        {
          name: ILike(`%${q}%`),
          ...(categoryId ? { category: { id: categoryId } } : {}),
          ...(status ? { status } : {}),
        },
        {
          courseId: ILike(`%${q}%`),
          ...(categoryId ? { category: { id: categoryId } } : {}),
          ...(status ? { status } : {}),
        },
      ];
    } else {
      where = {};
      if (categoryId) {
        where.category = { id: categoryId };
      }
      if (status) {
        where.status = status;
      }
    }

    const [courses, total] = await Promise.all([
      this.courseRepository.find({
        where,
        skip: skippedItems,
        take: limit,
        relations: {
          category: true,
          lessons: true,
        },
        select: {
          id: true,
          name: true,
          courseId: true,
          enrolled: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          thumbnailUrl: true,
          description: true,
          category: {
            id: true,
            name: true,
          },
          lessons: {
            id: true, // Only fetch lesson IDs to count them
          },
        },
        order: {
          createdAt: 'DESC',
        },
      }),
      this.courseRepository.count({ where }),
    ]);

    const data = courses.map((course) => {
      const { lessons, ...courseData } = course;
      return {
        ...courseData,
        totalLessons: lessons ? lessons.length : 0,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  async getCourseById(courseId: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: { courseId },
      withDeleted: true,
      relations: {
        category: true,
        lessons: true,
        enrollments: true,
      },
    });

    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    course.completionRate = this.calculateOverallCompletionRate(course);
    return course;
  }

  async createCourse(
    createCourseDto: CreateCourseDto,
    requesterId: string,
  ): Promise<Course> {
    // Always verify role from DB using the JWT-authenticated userId — never trust client body
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can create courses',
      );
    }

    const courseId = await this.generateNextCourseId();

    let category: Category | null = null;
    if (createCourseDto.categoryId) {
      category = await this.categoryRepository.findOne({
        where: { id: createCourseDto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(
          `Category with ID ${createCourseDto.categoryId} not found`,
        );
      }
    }

    const course = this.courseRepository.create({
      ...createCourseDto,
      courseId,
      category,
    });

    const savedCourse = await this.courseRepository.save(course);

    await this.logAction(
      requesterId,
      'COURSE_CREATED',
      'Course',
      savedCourse.name,
      savedCourse.courseId,
      {
        courseId: savedCourse.courseId,
        status: savedCourse.status,
        categoryId: savedCourse.category?.id,
      },
      savedCourse.courseId,
    );

    return savedCourse;
  }

  async updateCourse(
    courseId: string,
    updateCourseDto: UpdateCourseDto,
    requesterId: string,
  ): Promise<Course> {
    // Always verify role from DB using the JWT-authenticated userId
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can update courses',
      );
    }

    const course = await this.courseRepository.findOne({ where: { courseId } });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    if (updateCourseDto.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: updateCourseDto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(
          `Category with ID ${updateCourseDto.categoryId} not found`,
        );
      }
      course.category = category;
    }

    Object.assign(course, updateCourseDto);
    const saved = await this.courseRepository.save(course);

    await this.logAction(
      requesterId,
      'COURSE_UPDATED',
      'Course',
      saved.name,
      saved.courseId,
      {
        courseId: saved.courseId,
        changedFields: Object.keys(updateCourseDto).filter(
          (k) => (updateCourseDto as any)[k] !== undefined,
        ),
      },
      saved.courseId,
    );

    return saved;
  }

  async updateCourseStatus(
    courseId: string,
    status: string,
    userId: string,
  ): Promise<Course> {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    if (user.role !== 'admin' && user.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can update course status',
      );
    }

    if (status !== 'active' && status !== 'inactive' && status !== 'draft') {
      throw new BadRequestException(
        'Invalid course status. Must be active, inactive, or draft',
      );
    }

    const course = await this.courseRepository.findOne({ where: { courseId } });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    course.status = status;
    const saved = await this.courseRepository.save(course);

    await this.logAction(
      userId,
      'COURSE_STATUS_CHANGED',
      'Course',
      saved.name,
      saved.courseId,
      { courseId: saved.courseId, newStatus: status },
      saved.courseId,
    );

    return saved;
  }

  async deleteCourse(
    courseId: string,
    requesterId: string,
  ): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can delete courses',
      );
    }

    const course = await this.courseRepository.findOne({ where: { courseId } });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    await this.courseRepository.softRemove(course);

    await this.logAction(
      requesterId,
      'COURSE_DELETED',
      'Course',
      course.name,
      course.courseId,
      { courseId: course.courseId },
      course.courseId,
    );

    return { message: 'Course successfully moved to recycle bin' };
  }

  async restoreCourse(
    courseId: string,
    requesterId: string,
  ): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can restore courses',
      );
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      withDeleted: true,
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    await this.courseRepository.restore(course.id);

    await this.logAction(
      requesterId,
      'COURSE_RESTORED',
      'Course',
      course.name,
      course.courseId,
      { courseId: course.courseId },
      course.courseId,
    );

    return { message: 'Course successfully restored' };
  }

  async hardDeleteCourse(
    courseId: string,
    requesterId: string,
  ): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can permanently delete courses',
      );
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      withDeleted: true,
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    // Clean up all physical files associated with the course, its lessons, and tests
    await this.cleanupPhysicalFilesForCourse(course.id);

    await this.courseRepository.delete(course.id);

    await this.logAction(
      requesterId,
      'COURSE_PERMANENTLY_DELETED',
      'Course',
      course.name,
      course.courseId,
      { courseId: course.courseId },
      course.courseId,
    );

    return { message: 'Course permanently deleted' };
  }

  // --- Lesson Logic ---
  async getLessonById(courseId: string, lessonId: string): Promise<Lesson> {
    const course = await this.courseRepository.findOne({
      where: { courseId },
      withDeleted: true,
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { id: course.id } },
      withDeleted: true, // Allow fetching if it's soft-deleted
    });

    if (!lesson) {
      throw new NotFoundException(
        `Lesson with ID ${lessonId} not found in course ${courseId}`,
      );
    }

    return lesson;
  }

  async getLessonsByCourseId(courseId: string): Promise<Lesson[]> {
    const course = await this.courseRepository.findOne({
      where: { courseId },
      withDeleted: true,
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    return this.lessonRepository.find({
      where: { course: { id: course.id } },
      withDeleted: true,
      select: {
        id: true,
        lessonId: true,
        title: true,
        description: true,
        materialType: true,
        materialLink: true,
        status: true,
        practiceEnabled: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        tests: {
          id: true,
        },
      },
      relations: {
        tests: true,
      },
      order: {
        id: 'ASC',
      },
    });
  }

  async addLessonToCourse(
    courseId: string,
    createLessonDto: CreateLessonDto,
    requesterId: string,
  ): Promise<Lesson> {
    // Always verify role from DB using the JWT-authenticated userId
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can add lessons to courses',
      );
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
        enrollments: {
          user: true,
        },
      },
    });

    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const lessonId = await this.generateNextLessonId();

    const lesson = this.lessonRepository.create({
      ...createLessonDto,
      title: createLessonDto.title,
      lessonId,
      course,
    });

    const savedLesson = await this.lessonRepository.save(lesson);

    // After adding a new lesson, recalculate progress for all enrolled users
    if (course.enrollments && course.enrollments.length > 0) {
      for (const enrollment of course.enrollments) {
        const updatedTotalLessons = course.lessons.length + 1;
        const completedCount = enrollment.completedLessons
          ? enrollment.completedLessons.length
          : 0;
        enrollment.progress =
          Math.round((completedCount / updatedTotalLessons) * 100 * 100) / 100;
        await this.enrollmentRepository.save(enrollment);

        if (createLessonDto.status === 'Active') {
          // Create Notification
          const notification = new Notification();
          notification.message = `A new lesson "${createLessonDto.title}" has been published in ${course.name}.`;
          notification.user = enrollment.user;
          notification.actionLink = `/dashboard/learn/${course.courseId}?lesson=${savedLesson.id}`;
          const savedNotif =
            await this.notificationRepository.save(notification);

          // Send Real-time alert
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

    await this.logAction(
      requesterId,
      'LESSON_CREATED',
      'Lesson',
      savedLesson.title,
      savedLesson.lessonId,
      {
        lessonId: savedLesson.lessonId,
        courseId: course.courseId,
        status: savedLesson.status,
      },
      course.courseId,
    );

    return savedLesson;
  }

  async updateLesson(
    courseId: string,
    lessonId: string,
    updateLessonDto: UpdateLessonDto,
    requesterId: string,
  ): Promise<Lesson> {
    // Always verify role from DB using the JWT-authenticated userId
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can update lessons',
      );
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { courseId } },
    });

    if (!lesson) {
      throw new NotFoundException(
        `Lesson ${lessonId} belonging to course ${courseId} not found`,
      );
    }

    Object.assign(lesson, updateLessonDto);
    const saved = await this.lessonRepository.save(lesson);

    await this.logAction(
      requesterId,
      'LESSON_UPDATED',
      'Lesson',
      saved.title,
      saved.lessonId,
      {
        lessonId: saved.lessonId,
        courseId: courseId,
        changedFields: Object.keys(updateLessonDto).filter(
          (k) => (updateLessonDto as any)[k] !== undefined,
        ),
      },
      courseId,
    );

    return saved;
  }

  async deleteLesson(
    courseId: string,
    lessonId: string,
    requesterId: string,
  ): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can delete lessons',
      );
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
        enrollments: {
          completedLessons: true,
        },
      },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { id: course.id } },
    });
    if (!lesson) {
      throw new NotFoundException(
        `Lesson ${lessonId} belonging to course ${courseId} not found`,
      );
    }

    const remainingLessonsCount = course.lessons.length - 1;
    if (course.enrollments && course.enrollments.length > 0) {
      for (const enrollment of course.enrollments) {
        const hadCompleted = enrollment.completedLessons.some(
          (cl) => cl.id === lesson.id,
        );
        if (hadCompleted) {
          enrollment.completedLessons = enrollment.completedLessons.filter(
            (cl) => cl.id !== lesson.id,
          );
        }

        const completedCount = enrollment.completedLessons.length;
        if (remainingLessonsCount > 0) {
          enrollment.progress =
            Math.round((completedCount / remainingLessonsCount) * 100 * 100) /
            100;
        } else {
          enrollment.progress = 0;
        }
        await this.enrollmentRepository.save(enrollment);
      }
    }

    await this.lessonRepository.softRemove(lesson);

    await this.logAction(
      requesterId,
      'LESSON_DELETED',
      'Lesson',
      lesson.title,
      lesson.lessonId,
      { lessonId: lesson.lessonId, courseId },
      courseId,
    );

    return { message: 'Lesson successfully moved to recycle bin' };
  }

  async restoreLesson(
    courseId: string,
    lessonId: string,
    requesterId: string,
  ): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can restore lessons',
      );
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
        enrollments: {
          completedLessons: true,
        },
      },
      withDeleted: true,
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { id: course.id } },
      withDeleted: true,
    });
    if (!lesson) {
      throw new NotFoundException(
        `Lesson ${lessonId} belonging to course ${courseId} not found`,
      );
    }

    await this.lessonRepository.restore(lesson.id);

    const activeLessons = await this.lessonRepository.count({
      where: { course: { id: course.id } },
    });
    if (course.enrollments && course.enrollments.length > 0) {
      for (const enrollment of course.enrollments) {
        const completedCount = enrollment.completedLessons.length;
        enrollment.progress =
          Math.round((completedCount / activeLessons) * 100 * 100) / 100;
        await this.enrollmentRepository.save(enrollment);
      }
    }

    await this.logAction(
      requesterId,
      'LESSON_RESTORED',
      'Lesson',
      lesson.title,
      lesson.lessonId,
      { lessonId: lesson.lessonId, courseId },
      courseId,
    );

    return { message: 'Lesson successfully restored' };
  }

  async hardDeleteLesson(
    courseId: string,
    lessonId: string,
    requesterId: string,
  ): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can permanently delete lessons',
      );
    }

    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
        enrollments: {
          completedLessons: true,
        },
      },
      withDeleted: true,
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { id: course.id } },
      withDeleted: true,
    });
    if (!lesson) {
      throw new NotFoundException(
        `Lesson ${lessonId} belonging to course ${courseId} not found`,
      );
    }

    const isAlreadySoftDeleted = lesson.deletedAt !== null;
    if (!isAlreadySoftDeleted) {
      const remainingLessonsCount = course.lessons.length - 1;
      if (course.enrollments && course.enrollments.length > 0) {
        for (const enrollment of course.enrollments) {
          const hadCompleted = enrollment.completedLessons.some(
            (cl) => cl.id === lesson.id,
          );
          if (hadCompleted) {
            enrollment.completedLessons = enrollment.completedLessons.filter(
              (cl) => cl.id !== lesson.id,
            );
          }

          const completedCount = enrollment.completedLessons.length;
          if (remainingLessonsCount > 0) {
            enrollment.progress =
              Math.round((completedCount / remainingLessonsCount) * 100 * 100) /
              100;
          } else {
            enrollment.progress = 0;
          }
          await this.enrollmentRepository.save(enrollment);
        }
      }
    }

    // Clean up physical files for the lesson and its tests
    await this.cleanupPhysicalFilesForLesson(lesson.id);

    await this.lessonRepository.delete(lesson.id);

    await this.logAction(
      requesterId,
      'LESSON_PERMANENTLY_DELETED',
      'Lesson',
      lesson.title,
      lesson.lessonId,
      { lessonId: lesson.lessonId, courseId },
      courseId,
    );

    return { message: 'Lesson permanently deleted' };
  }

  // --- Enrollment & Progress Logic ---
  async enrollUser(courseId: string, userId: string): Promise<Enrollment> {
    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
      },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }
    if (course.status !== 'active') {
      throw new BadRequestException(
        `Cannot enroll in a course that is in "${course.status}" status`,
      );
    }

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const existingEnrollment = await this.enrollmentRepository.findOne({
      where: { user: { id: user.id }, course: { id: course.id } },
    });
    if (existingEnrollment) {
      throw new ConflictException('User is already enrolled in this course');
    }

    const enrollment = this.enrollmentRepository.create({
      user,
      course,
      completedLessons: [],
      progress: 0.0,
    });

    const savedEnrollment = await this.enrollmentRepository.save(enrollment);

    course.enrolled = (course.enrolled || 0) + 1;
    await this.courseRepository.save(course);

    await this.logAction(
      user.userId,
      'USER_ENROLLED',
      'Course',
      course.name,
      course.courseId,
      { courseId: course.courseId, studentName: user.name },
      course.courseId,
    );

    return savedEnrollment;
  }

  async getMyLearningPaginated(
    userId: string,
    page: number = 1,
    limit: number = 6,
    status: string = 'all',
  ) {
    const skippedItems = (page - 1) * limit;

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');

    let progressCondition: any = {};
    if (status === 'completed') {
      progressCondition = { progress: 100 };
    } else if (status === 'in-progress') {
      progressCondition = { progress: LessThan(100) };
    }

    const [enrollments, total] = await this.enrollmentRepository.findAndCount({
      where: {
        user: { id: user.id },
        ...progressCondition,
        course: { status: 'active' },
      },
      relations: {
        course: {
          category: true,
          lessons: true,
        },
      },
      skip: skippedItems,
      take: limit,
      order: {
        updatedAt: 'DESC',
      },
    });

    const data = enrollments
      .map((e) => {
        if (!e.course) return null;
        const { lessons, ...courseData } = e.course;
        return {
          ...courseData,
          totalLessons: lessons ? lessons.length : 0,
          progress: e.progress,
        };
      })
      .filter(Boolean);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }

  async completeLesson(
    courseId: string,
    lessonId: string,
    userId: string,
  ): Promise<Enrollment> {
    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
      },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }
    if (course.status !== 'active') {
      throw new BadRequestException(
        `Cannot complete lessons for a course that is in "${course.status}" status`,
      );
    }

    const lesson = await this.lessonRepository.findOne({
      where: { lessonId, course: { id: course.id } },
    });
    if (!lesson) {
      throw new NotFoundException(
        `Lesson with ID ${lessonId} belonging to course ${courseId} not found`,
      );
    }

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const enrollment = await this.enrollmentRepository.findOne({
      where: { user: { id: user.id }, course: { id: course.id } },
      relations: {
        completedLessons: true,
        course: {
          lessons: true,
        },
      },
    });

    if (!enrollment) {
      throw new BadRequestException(
        `User with ID ${userId} is not enrolled in course ${courseId}`,
      );
    }

    const alreadyCompleted = enrollment.completedLessons.some(
      (cl) => cl.id === lesson.id,
    );
    if (!alreadyCompleted) {
      // Check if this lesson has any tests
      const tests = await this.testRepository.find({
        where: {
          lesson: { id: lesson.id },
          testType: Not('Practice'),
        },
      });
      if (tests.length > 0) {
        // Must have at least one valid submission for all tests?
        // Let's enforce that ALL tests in this lesson must be submitted.
        for (const test of tests) {
          const submission = await this.testSubmissionRepository.findOne({
            where: {
              test: { id: test.id },
              user: { id: user.id },
              isDraft: false,
            },
          });
          if (!submission) {
            throw new BadRequestException(
              `Cannot complete lesson. You must participate in the test: ${test.title}`,
            );
          }
        }
      }

      enrollment.completedLessons.push(lesson);

      const totalLessons = enrollment.course.lessons.length;
      const completedCount = enrollment.completedLessons.length;
      enrollment.progress =
        Math.round((completedCount / totalLessons) * 100 * 100) / 100;

      await this.enrollmentRepository.save(enrollment);
    }

    return enrollment;
  }

  async getUserProgress(
    courseId: string,
    userId: string,
  ): Promise<{
    progress: number;
    completedLessonsCount: number;
    totalLessonsCount: number;
    completedLessons: string[];
  }> {
    const course = await this.courseRepository.findOne({
      where: { courseId },
      relations: {
        lessons: true,
      },
    });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const enrollment = await this.enrollmentRepository.findOne({
      where: { user: { id: user.id }, course: { id: course.id } },
      relations: {
        completedLessons: true,
      },
    });

    if (!enrollment) {
      throw new NotFoundException(
        `User with ID ${userId} is not enrolled in course ${courseId}`,
      );
    }

    return {
      progress: enrollment.progress,
      completedLessonsCount: enrollment.completedLessons.length,
      totalLessonsCount: course.lessons.length,
      completedLessons: enrollment.completedLessons.map((l) => l.lessonId),
    };
  }

  // --- Search Logic ---
  async searchUnified(
    query: string,
  ): Promise<{ courses: any[]; employees: Omit<User, 'password'>[] }> {
    const courses = await this.courseRepository.find({
      where: [{ name: ILike(`%${query}%`) }, { courseId: ILike(`%${query}%`) }],
      relations: { category: true, lessons: true },
      select: {
        id: true,
        name: true,
        courseId: true,
        enrolled: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        description: true,
        thumbnailUrl: true,
        category: {
          id: true,
          name: true,
        },
        lessons: {
          id: true,
        },
      },
      order: {
        createdAt: 'DESC',
      },
    });

    const employees = await this.userRepository.find({
      where: [
        { role: 'employee', name: ILike(`%${query}%`) },
        { role: 'employee', email: ILike(`%${query}%`) },
        { role: 'employee', userId: ILike(`%${query}%`) },
      ],
    });

    const employeesWithoutPassword = employees.map(
      ({ password, ...user }) => user,
    );

    const mappedCourses = courses.map((course) => {
      const { lessons, ...courseData } = course;
      return {
        ...courseData,
        totalLessons: lessons ? lessons.length : 0,
      };
    });

    return {
      courses: mappedCourses,
      employees: employeesWithoutPassword,
    };
  }

  async searchCoursesOnly(query: string): Promise<any[]> {
    const courses = await this.courseRepository.find({
      where: [{ name: ILike(`%${query}%`) }, { courseId: ILike(`%${query}%`) }],
      relations: { category: true, lessons: true },
      select: {
        id: true,
        name: true,
        courseId: true,
        enrolled: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        description: true,
        thumbnailUrl: true,
        category: {
          id: true,
          name: true,
        },
        lessons: {
          id: true,
        },
      },
      order: {
        createdAt: 'DESC',
      },
    });

    return courses.map((course) => {
      const { lessons, ...courseData } = course;
      return {
        ...courseData,
        totalLessons: lessons ? lessons.length : 0,
      };
    });
  }

  // --- Statistics & Analytics ---
  async getDashboardStats(): Promise<{
    totalUsers: number;
    totalCourses: number;
    totalEmployees: number;
    overallCompletionRate: number;
  }> {
    const [totalUsers, totalCourses, totalEmployees, avgProgressResult] =
      await Promise.all([
        this.userRepository.count(),
        this.courseRepository.count(),
        this.userRepository.count({ where: { role: 'employee' } }),
        this.enrollmentRepository
          .createQueryBuilder('enrollment')
          .select('AVG(enrollment.progress)', 'avg')
          .getRawOne(),
      ]);

    const overallCompletionRate =
      avgProgressResult && avgProgressResult.avg
        ? Math.round(parseFloat(avgProgressResult.avg) * 100) / 100
        : 0;

    return { totalUsers, totalCourses, totalEmployees, overallCompletionRate };
  }

  async getMonthlyProgress(): Promise<{ month: string; progress: number }[]> {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const data = await this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .select("TO_CHAR(enrollment.createdAt, 'Mon YYYY')", 'month')
      .addSelect('AVG(enrollment.progress)', 'progress')
      .where('enrollment.createdAt >= :date', { date: twelveMonthsAgo })
      .groupBy("TO_CHAR(enrollment.createdAt, 'Mon YYYY')")
      .orderBy('MIN(enrollment.createdAt)', 'ASC')
      .getRawMany();

    if (data.length === 0) {
      return [
        { month: 'Jan 2026', progress: 10.5 },
        { month: 'Feb 2026', progress: 24.0 },
        { month: 'Mar 2026', progress: 38.5 },
        { month: 'Apr 2026', progress: 51.0 },
        { month: 'May 2026', progress: 63.8 },
        { month: 'Jun 2026', progress: 78.4 },
      ];
    }

    return data.map((d) => ({
      month: d.month,
      progress: Math.round(parseFloat(d.progress) * 100) / 100,
    }));
  }

  async getCourseProgressComparison(): Promise<
    {
      courseId: string;
      name: string;
      enrolledCount: number;
      completionRate: number;
    }[]
  > {
    const courses = await this.courseRepository
      .createQueryBuilder('course')
      .leftJoin('course.enrollments', 'enrollment')
      .select('course.courseId', 'courseId')
      .addSelect('course.name', 'name')
      .addSelect('COUNT(enrollment.id)', 'enrolledCount')
      .addSelect('COALESCE(AVG(enrollment.progress), 0)', 'completionRate')
      .groupBy('course.id')
      .getRawMany();

    return courses.map((c) => ({
      courseId: c.courseId,
      name: c.name,
      enrolledCount: parseInt(c.enrolledCount, 10) || 0,
      completionRate: Math.round(parseFloat(c.completionRate) * 100) / 100,
    }));
  }

  async getCoursePerformance(): Promise<any[]> {
    const courses = await this.courseRepository
      .createQueryBuilder('course')
      .leftJoin('course.enrollments', 'enrollment')
      .leftJoin('course.category', 'category')
      .select('course.courseId', 'courseId')
      .addSelect('course.name', 'name')
      .addSelect("COALESCE(category.name, 'N/A')", 'category')
      .addSelect('COUNT(enrollment.id)', 'enrolledCount')
      .addSelect('COALESCE(AVG(enrollment.progress), 0)', 'completionRate')
      .groupBy('course.id, category.name')
      .orderBy('"completionRate"', 'DESC')
      .getRawMany();

    return courses.map((c) => ({
      courseId: c.courseId,
      name: c.name,
      category: c.category,
      enrolledCount: parseInt(c.enrolledCount, 10) || 0,
      completionRate: Math.round(parseFloat(c.completionRate) * 100) / 100,
    }));
  }

  async getUserPerformance(pageStr?: string, limitStr?: string): Promise<any> {
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = limitStr ? parseInt(limitStr, 10) : 6;
    const skip = (page - 1) * limit;

    const query = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.enrollments', 'enrollment')
      .select('user.userId', 'userId')
      .addSelect('user.name', 'name')
      .addSelect('user.email', 'email')
      .addSelect('user.role', 'role')
      .addSelect(
        'COUNT(CASE WHEN enrollment.progress = 100 THEN 1 END)',
        'completedCoursesCount',
      )
      .addSelect(
        'COUNT(CASE WHEN enrollment.progress > 0 AND enrollment.progress < 100 THEN 1 END)',
        'activeCoursesCount',
      )
      .addSelect('COALESCE(AVG(enrollment.progress), 0)', 'averageProgress')
      .groupBy('user.id')
      .orderBy('"averageProgress"', 'DESC')
      .limit(limit)
      .offset(skip);

    const [dataRaw, totalRaw] = await Promise.all([
      query.getRawMany(),
      this.userRepository.count(),
    ]);

    const data = dataRaw.map((u) => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
      role: u.role,
      completedCoursesCount: parseInt(u.completedCoursesCount, 10) || 0,
      activeCoursesCount: parseInt(u.activeCoursesCount, 10) || 0,
      averageProgress: Math.round(parseFloat(u.averageProgress) * 100) / 100,
    }));

    return {
      data,
      total: totalRaw,
      page,
      totalPages: Math.ceil(totalRaw / limit),
    };
  }

  async getCategoryStats(pageStr?: string, limitStr?: string): Promise<any> {
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = limitStr ? parseInt(limitStr, 10) : 6;
    const skip = (page - 1) * limit;

    const query = this.categoryRepository
      .createQueryBuilder('category')
      .leftJoin('category.courses', 'course')
      .leftJoin('course.enrollments', 'enrollment')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('COUNT(DISTINCT course.id)', 'coursesCount')
      .addSelect('COUNT(enrollment.id)', 'totalEnrolled')
      .addSelect('COALESCE(AVG(enrollment.progress), 0)', 'averageProgress')
      .groupBy('category.id')
      .orderBy('"averageProgress"', 'DESC')
      .limit(limit)
      .offset(skip);

    const [dataRaw, totalRaw] = await Promise.all([
      query.getRawMany(),
      this.categoryRepository.count(),
    ]);

    const data = dataRaw.map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      coursesCount: parseInt(c.coursesCount, 10) || 0,
      totalEnrolled: parseInt(c.totalEnrolled, 10) || 0,
      averageProgress: Math.round(parseFloat(c.averageProgress) * 100) / 100,
    }));

    return {
      data,
      total: totalRaw,
      page,
      totalPages: Math.ceil(totalRaw / limit),
    };
  }

  async getMaterialStats(): Promise<any[]> {
    const availableRaw = await this.lessonRepository
      .createQueryBuilder('lesson')
      .select('lesson.materialType', 'materialType')
      .addSelect('COUNT(lesson.id)', 'count')
      .groupBy('lesson.materialType')
      .getRawMany();

    const completedRaw = await this.enrollmentRepository.query(`
      SELECT l."materialType", COUNT(l.id) as count
      FROM enrollment_completed_lessons ecl
      JOIN lessons l ON l.id = ecl."lessonsId"
      GROUP BY l."materialType"
    `);

    const materialMap = new Map<
      string,
      { count: number; completedCount: number }
    >();
    materialMap.set('Video', { count: 0, completedCount: 0 });
    materialMap.set('PDF', { count: 0, completedCount: 0 });
    materialMap.set('PPT', { count: 0, completedCount: 0 });

    availableRaw.forEach((r) => {
      const stats = materialMap.get(r.materialType) || {
        count: 0,
        completedCount: 0,
      };
      stats.count = parseInt(r.count, 10) || 0;
      materialMap.set(r.materialType, stats);
    });

    completedRaw.forEach((r) => {
      const stats = materialMap.get(r.materialType) || {
        count: 0,
        completedCount: 0,
      };
      stats.completedCount = parseInt(r.count, 10) || 0;
      materialMap.set(r.materialType, stats);
    });

    return Array.from(materialMap.entries()).map(([materialType, stats]) => ({
      materialType,
      availableLessonsCount: stats.count,
      totalCompletedLessonsCount: stats.completedCount,
    }));
  }

  async getAtRiskLearners(pageStr?: string, limitStr?: string): Promise<any> {
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = limitStr ? parseInt(limitStr, 10) : 6;
    const skip = (page - 1) * limit;

    const [atRisk, total] = await this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .leftJoinAndSelect('enrollment.user', 'user')
      .leftJoinAndSelect('enrollment.course', 'course')
      .where('enrollment.progress < 15.0')
      .orderBy('enrollment.progress', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const data = atRisk.map((e) => ({
      userId: e.user.userId,
      name: e.user.name,
      email: e.user.email,
      courseId: e.course.courseId,
      courseName: e.course.name,
      progress: e.progress,
    }));

    const totalPages = Math.ceil(total / limit);
    return { data, total, page, totalPages };
  }

  async getRecentActivity(): Promise<any[]> {
    const enrollments = await this.enrollmentRepository
      .createQueryBuilder('enrollment')
      .leftJoinAndSelect('enrollment.user', 'user')
      .leftJoinAndSelect('enrollment.course', 'course')
      .orderBy('enrollment.id', 'DESC')
      .take(10)
      .getMany();

    return enrollments.map((e) => ({
      activityId: e.id,
      type: 'enrollment',
      userId: e.user.userId,
      userName: e.user.name,
      courseId: e.course.courseId,
      courseName: e.course.name,
      message: `${e.user.name} enrolled in ${e.course.name}`,
      timestamp: e.createdAt,
    }));
  }

  async getTrashItems(
    requesterId: string,
    q?: string,
    type?: 'course' | 'lesson',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ): Promise<any[]> {
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin' && requester.role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can view recycle bin',
      );
    }

    const trashItems: any[] = [];

    // 1. Fetch soft-deleted courses if type matches
    if (!type || type === 'course') {
      const coursesQuery = this.courseRepository
        .createQueryBuilder('course')
        .withDeleted()
        .where('course.deletedAt IS NOT NULL')
        .leftJoinAndSelect('course.category', 'category');

      if (q) {
        coursesQuery.andWhere(
          '(course.name ILike :q OR course.courseId ILike :q)',
          { q: `%${q}%` },
        );
      }

      const courses = await coursesQuery.getMany();
      courses.forEach((c) => {
        trashItems.push({
          id: c.courseId,
          courseId: c.courseId, // Added for frontend compatibility
          dbId: c.id,
          type: 'course',
          name: c.name,
          deletedAt: c.deletedAt,
          category: c.category ? c.category.name : null,
        });
      });
    }

    // 2. Fetch soft-deleted lessons if type matches
    if (!type || type === 'lesson') {
      const lessonsQuery = this.lessonRepository
        .createQueryBuilder('lesson')
        .withDeleted()
        .where('lesson.deletedAt IS NOT NULL')
        .leftJoinAndSelect('lesson.course', 'course');

      if (q) {
        lessonsQuery.andWhere(
          '(lesson.title ILike :q OR lesson.lessonId ILike :q)',
          { q: `%${q}%` },
        );
      }

      const lessons = await lessonsQuery.getMany();
      lessons.forEach((l) => {
        trashItems.push({
          id: l.lessonId,
          lessonId: l.lessonId, // Added for frontend compatibility
          dbId: l.id,
          type: 'lesson',
          name: l.title,
          deletedAt: l.deletedAt,
          courseId: l.course ? l.course.courseId : null,
          courseName: l.course ? l.course.name : null,
        });
      });
    }

    // Sort combined items by deletedAt
    trashItems.sort((a, b) => {
      const dateA = new Date(a.deletedAt).getTime();
      const dateB = new Date(b.deletedAt).getTime();
      return sortOrder === 'DESC' ? dateB - dateA : dateA - dateB;
    });

    return trashItems;
  }

  async emptyRecycleBin(requesterId: string): Promise<{ message: string }> {
    const requester = await this.userRepository.findOne({
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

    // Find all soft-deleted lessons and clean up physical files
    const softDeletedLessons = await this.lessonRepository.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
    });
    for (const l of softDeletedLessons) {
      await this.cleanupPhysicalFilesForLesson(l.id);
    }

    // Hard-delete all soft-deleted lessons
    await this.lessonRepository
      .createQueryBuilder()
      .delete()
      .from(Lesson)
      .where('deletedAt IS NOT NULL')
      .execute();

    // Find all soft-deleted courses and clean up physical files
    const softDeletedCourses = await this.courseRepository.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
    });
    for (const c of softDeletedCourses) {
      await this.cleanupPhysicalFilesForCourse(c.id);
    }

    // Hard-delete all soft-deleted courses
    await this.courseRepository
      .createQueryBuilder()
      .delete()
      .from(Course)
      .where('deletedAt IS NOT NULL')
      .execute();

    await this.logAction(requesterId, 'RECYCLE_BIN_EMPTIED', 'RecycleBin', 'Recycle Bin', 'trash', {
      coursesDeleted: softDeletedCourses.length,
      lessonsDeleted: softDeletedLessons.length,
    });

    return { message: 'Recycle bin successfully emptied' };
  }
}
