import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import * as fs from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { Certificate } from './entities/certificate.entity';
import { User } from '../auth/entities/user.entity';
import { Course } from '../courses/entities/course.entity';
import { Test } from '../courses/entities/test.entity';
import { TestSubmission } from '../courses/entities/test-submission.entity';
import { Notification } from '../courses/entities/notification.entity';
import { Enrollment } from '../courses/entities/enrollment.entity';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { NotificationsGateway } from '../courses/notifications.gateway';

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    @InjectRepository(Certificate)
    private readonly certRepo: Repository<Certificate>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    @InjectRepository(Test)
    private readonly testRepo: Repository<Test>,
    @InjectRepository(TestSubmission)
    private readonly submissionRepo: Repository<TestSubmission>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(Enrollment)
    private readonly enrollmentRepo: Repository<Enrollment>,
    private readonly activityLogsService: ActivityLogsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  private async assertAdminOrEmployee(requesterId: string): Promise<User> {
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
        'Only admin and employee users can perform this action',
      );
    }
    return requester;
  }

  private async findCourseByCode(courseId: string): Promise<Course> {
    const course = await this.courseRepo.findOne({ where: { courseId } });
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }
    return course;
  }

  private async getAllCourseTests(courseId: number): Promise<Test[]> {
    return this.testRepo.find({
      where: [
        { course: { id: courseId }, testType: Not('Practice') },
        { lesson: { course: { id: courseId } }, testType: Not('Practice') },
      ],
      relations: { lesson: true, questions: true },
    });
  }

  private async generateNextCertificateId(): Promise<string> {
    const last = await this.certRepo.findOne({
      where: {},
      order: { id: 'DESC' },
    });
    if (!last) {
      return 'CERT-0001';
    }
    const match = last.certificateId.match(/CERT-(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 1;
    return `CERT-${String(nextNum).padStart(4, '0')}`;
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
      this.logger.error(
        `[Certificate] Failed to send notification: ${err?.message}`,
      );
    }
  }

  private async notifyStaff(message: string, actionLink: string) {
    try {
      const staff = await this.userRepo.find({
        where: { role: In(['admin', 'employee']) },
      });
      for (const member of staff) {
        await this.sendNotification(member, message, actionLink);
      }
    } catch (err: any) {
      this.logger.error(
        `[Certificate] Failed to notify staff: ${err?.message}`,
      );
    }
  }

  async getEligibility(courseId: string, requesterId: string) {
    const course = await this.findCourseByCode(courseId);
    const user = await this.userRepo.findOne({ where: { userId: requesterId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${requesterId} not found`);
    }

    const tests = await this.getAllCourseTests(course.id);
    const ids = tests.map((t) => t.id);
    const submissions =
      ids.length > 0
        ? await this.submissionRepo.find({
            where: {
              user: { id: user.id },
              isDraft: false,
              test: In(ids),
            },
            relations: { test: true },
          })
        : [];

    const takenIds = new Set(submissions.map((s) => s.test.id));
    const missingTests = tests.filter((t) => !takenIds.has(t.id));
    const allTestsTaken = missingTests.length === 0;

    const courseWithLessons = await this.courseRepo.findOne({
      where: { id: course.id },
      relations: { lessons: true },
    });
    const totalLessons = courseWithLessons?.lessons?.length || 0;
    const enrollment = await this.enrollmentRepo.findOne({
      where: { user: { id: user.id }, course: { id: course.id } },
    });
    const courseProgress = enrollment?.progress || 0;
    const courseCompleted = totalLessons === 0 || courseProgress >= 100;

    const eligible = allTestsTaken && courseCompleted;

    const myCertificate = await this.certRepo.findOne({
      where: { userId: requesterId, courseId: course.courseId },
      order: { id: 'DESC' },
    });

    return {
      courseId: course.courseId,
      courseName: course.name,
      totalTests: tests.length,
      takenTests: takenIds.size,
      missingTests: missingTests.map((t) => ({
        testId: t.id,
        title: t.title,
        testType: t.testType,
      })),
      totalLessons,
      courseProgress,
      courseCompleted,
      eligible,
      myCertificate,
    };
  }

  async apply(courseId: string, requesterId: string) {
    const course = await this.findCourseByCode(courseId);
    const user = await this.userRepo.findOne({ where: { userId: requesterId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${requesterId} not found`);
    }

    const eligibility = await this.getEligibility(courseId, requesterId);
    if (!eligibility.eligible) {
      throw new BadRequestException(
        `You must take all the tests and complete 100% of the course before applying for a certificate.`,
      );
    }

    const existing = await this.certRepo.findOne({
      where: {
        userId: requesterId,
        courseId: course.courseId,
        status: In(['pending', 'issued']),
      },
    });
    if (existing) {
      throw new BadRequestException(
        `You already have a ${existing.status} certificate application for this course.`,
      );
    }

    const certificateId = await this.generateNextCertificateId();
    const cert = this.certRepo.create({
      certificateId,
      userId: requesterId,
      userName: user.name,
      courseId: course.courseId,
      courseName: course.name,
      status: 'pending',
    });
    const saved = await this.certRepo.save(cert);

    await this.notifyStaff(
      `${user.name} (${user.userId}) applied for a certificate for course ${course.name} (${certificateId}).`,
      `/dashboard/courses/${course.courseId}?tab=certifications`,
    );

    await this.activityLogsService.log({
      actorId: requesterId,
      actorName: user.name,
      actorRole: user.role,
      action: 'CERTIFICATE_APPLIED',
      targetType: 'Certificate',
      targetName: course.name,
      targetId: certificateId,
      courseId: course.courseId,
      details: {
        certificateId,
        courseId: course.courseId,
        testsTaken: eligibility.takenTests,
        totalTests: eligibility.totalTests,
      },
    });

    return saved;
  }

  async getMine(requesterId: string, courseId?: string) {
    const user = await this.userRepo.findOne({ where: { userId: requesterId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${requesterId} not found`);
    }
    const where: any = { userId: requesterId };
    if (courseId) {
      where.courseId = courseId;
    }
    return this.certRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async getCourseApplications(courseId: string, requesterId: string) {
    await this.assertAdminOrEmployee(requesterId);
    const course = await this.findCourseByCode(courseId);
    const certs = await this.certRepo.find({
      where: { courseId: course.courseId },
      order: { createdAt: 'DESC' },
    });
    const userIds = [...new Set(certs.map((c) => c.userId))];
    const users =
      userIds.length > 0
        ? await this.userRepo.find({ where: { userId: In(userIds) } })
        : [];
    const userMap = new Map(users.map((u) => [u.userId, u]));
    return certs.map((c) => {
      const u = userMap.get(c.userId);
      return {
        ...c,
        applicant: u
          ? {
              userId: u.userId,
              name: u.name,
              email: u.email,
              profilePictureUrl: u.profilePictureUrl,
              role: u.role,
            }
          : null,
      };
    });
  }

  async getApplicationDetail(id: number, requesterId: string) {
    await this.assertAdminOrEmployee(requesterId);
    const cert = await this.certRepo.findOne({ where: { id } });
    if (!cert) {
      throw new NotFoundException('Certificate application not found');
    }

    const applicant = await this.userRepo.findOne({
      where: { userId: cert.userId },
    });
    const course = await this.courseRepo.findOne({
      where: { courseId: cert.courseId },
    });

    let tests: any[] = [];
    if (course) {
      const allTests = await this.getAllCourseTests(course.id);
      const submissions =
        allTests.length > 0
          ? await this.submissionRepo.find({
              where: {
                user: { id: applicant?.id },
                isDraft: false,
                test: In(allTests.map((t) => t.id)),
              },
              relations: { test: true },
            })
          : [];
      const submissionMap = new Map(
        submissions.map((s) => [s.test.id, s]),
      );
      tests = allTests.map((t) => {
        const sub = submissionMap.get(t.id);
        return {
          testId: t.id,
          title: t.title,
          testType: t.testType,
          lessonTitle: t.lesson?.title || null,
          totalMarks: t.questions.reduce(
            (sum, q) => sum + (q.marks || 0),
            0,
          ),
          submission: sub
            ? {
                submitted: true,
                marksObtained: sub.marksObtained,
                status: sub.status,
                submittedAt: sub.submittedAt,
              }
            : { submitted: false },
        };
      });
    }

    const { password, ...safeApplicant } = applicant
      ? (applicant as any)
      : { password: undefined };

    return {
      certificate: cert,
      applicant: safeApplicant,
      course,
      tests,
    };
  }

  async generate(id: number, requesterId: string) {
    const requester = await this.assertAdminOrEmployee(requesterId);
    const cert = await this.certRepo.findOne({ where: { id } });
    if (!cert) {
      throw new NotFoundException('Certificate application not found');
    }
    if (cert.status !== 'pending') {
      throw new BadRequestException(
        `Certificate is already ${cert.status}. Only pending applications can be generated.`,
      );
    }

    const applicant = await this.userRepo.findOne({
      where: { userId: cert.userId },
    });
    const course = await this.courseRepo.findOne({
      where: { courseId: cert.courseId },
    });

    const certificateUrl = await this.generatePdf(cert, applicant, course);

    cert.status = 'issued';
    cert.issuedAt = new Date();
    cert.verifiedById = requesterId;
    cert.verifiedAt = new Date();
    cert.certificateUrl = certificateUrl;
    const saved = await this.certRepo.save(cert);

    await this.activityLogsService.log({
      actorId: requesterId,
      actorName: requester.name,
      actorRole: requester.role,
      action: 'CERTIFICATE_GENERATED',
      targetType: 'Certificate',
      targetName: cert.courseName,
      targetId: cert.certificateId,
      courseId: cert.courseId,
      details: {
        certificateId: cert.certificateId,
        studentId: cert.userId,
        studentName: cert.userName,
        certificateUrl,
      },
    });

    if (applicant) {
      await this.sendNotification(
        applicant,
        `Your certificate (${cert.certificateId}) for course "${cert.courseName}" has been generated. View and download it from your Certifications tab.`,
        `/dashboard/learn/${cert.courseId}?tab=certifications`,
      );
    }

    return saved;
  }

  async reject(id: number, requesterId: string, reason: string) {
    const requester = await this.assertAdminOrEmployee(requesterId);
    const cert = await this.certRepo.findOne({ where: { id } });
    if (!cert) {
      throw new NotFoundException('Certificate application not found');
    }
    if (cert.status !== 'pending') {
      throw new BadRequestException(
        `Certificate is already ${cert.status}. Only pending applications can be rejected.`,
      );
    }

    cert.status = 'rejected';
    cert.rejectionReason = reason;
    cert.verifiedById = requesterId;
    cert.verifiedAt = new Date();
    const saved = await this.certRepo.save(cert);

    await this.activityLogsService.log({
      actorId: requesterId,
      actorName: requester.name,
      actorRole: requester.role,
      action: 'CERTIFICATE_REJECTED',
      targetType: 'Certificate',
      targetName: cert.courseName,
      targetId: cert.certificateId,
      courseId: cert.courseId,
      details: {
        certificateId: cert.certificateId,
        studentId: cert.userId,
        studentName: cert.userName,
        reason,
      },
    });

    const applicant = await this.userRepo.findOne({
      where: { userId: cert.userId },
    });
    if (applicant) {
      await this.sendNotification(
        applicant,
        `Your certificate application for course "${cert.courseName}" was rejected. Reason: ${reason}`,
        `/dashboard/learn/${cert.courseId}?tab=certifications`,
      );
    }

    return saved;
  }

  async getPdfPath(id: number, requesterId: string) {
    const cert = await this.certRepo.findOne({ where: { id } });
    if (!cert) {
      throw new NotFoundException('Certificate not found');
    }
    if (cert.status !== 'issued' || !cert.certificateUrl) {
      throw new BadRequestException(
        'This certificate has not been generated yet.',
      );
    }
    const user = await this.userRepo.findOne({ where: { userId: requesterId } });
    const isOwner = cert.userId === requesterId;
    const isPrivileged =
      user && (user.role === 'admin' || user.role === 'employee');
    if (!isOwner && !isPrivileged) {
      throw new ForbiddenException(
        'You are not allowed to download this certificate',
      );
    }
    const filePath = join(process.cwd(), cert.certificateUrl);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Certificate PDF file is missing');
    }
    return { filePath, filename: `${cert.certificateId}.pdf` };
  }

  private async generatePdf(
    cert: Certificate,
    applicant: User | null,
    course: Course | null,
  ): Promise<string> {
    const dir = join(process.cwd(), 'uploads', 'certificates');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = join(dir, `${cert.certificateId}.pdf`);

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      bufferPages: true,
    });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const W = 841.89;
    const H = 595.28;
    const recipientName = applicant?.name || cert.userName;
    const studentId = applicant?.userId || cert.userId;
    const courseName = course?.name || cert.courseName;
    const courseCode = course?.courseId || cert.courseId;
    const issuedDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Outer & inner borders
    doc.rect(26, 26, W - 52, H - 52).lineWidth(3).stroke('#1e3a8a');
    doc.rect(34, 34, W - 68, H - 68).lineWidth(1).stroke('#f59e0b');

    // Brand header
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#1e3a8a').text(
      'TRAINXCEL',
      0,
      66,
      { align: 'center', characterSpacing: 3 },
    );
    doc.moveTo(W / 2 - 70, 90).lineTo(W / 2 + 70, 90).lineWidth(2).stroke('#f59e0b');
    doc.fillColor('#64748b').font('Helvetica').fontSize(10).text(
      'ENTERPRISE LEARNING MANAGEMENT SYSTEM',
      0,
      98,
      { align: 'center', characterSpacing: 1 },
    );

    // Title
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(32).text(
      'CERTIFICATE OF COMPLETION',
      0,
      132,
      { align: 'center' },
    );
    doc.fillColor('#f59e0b').font('Helvetica').fontSize(14).text(
      '\u2726 \u2726 \u2726',
      0,
      176,
      { align: 'center' },
    );

    // Recipient
    doc.fillColor('#475569').font('Helvetica').fontSize(12).text(
      'This certificate is proudly presented to',
      0,
      210,
      { align: 'center' },
    );
    doc.font('Helvetica-Bold').fontSize(30).fillColor('#0f172a').text(
      recipientName,
      0,
      238,
      { align: 'center' },
    );
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(11).text(
      `Student ID: ${studentId}`,
      0,
      280,
      { align: 'center' },
    );

    // Course
    doc.fillColor('#475569').font('Helvetica').fontSize(12).text(
      'for successfully completing all required assessments in',
      0,
      318,
      { align: 'center' },
    );
    doc.font('Helvetica-Bold').fontSize(21).fillColor('#1d4ed8').text(
      courseName,
      0,
      342,
      { align: 'center' },
    );
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(11).text(
      `Course Code: ${courseCode}    |    Certificate No: ${cert.certificateId}`,
      0,
      378,
      { align: 'center' },
    );

    // Issued date
    doc.fillColor('#64748b').font('Helvetica').fontSize(11).text(
      `Issued on ${issuedDate}`,
      0,
      410,
      { align: 'center' },
    );

    // Signature
    doc.moveTo(W / 2 - 95, 478).lineTo(W / 2 + 95, 478).lineWidth(1).stroke('#cbd5e1');
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(10).text(
      'TrainXcel Authorized Signatory',
      W / 2 - 95,
      484,
      { width: 190, align: 'center' },
    );

    doc.end();
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    return `/uploads/certificates/${cert.certificateId}.pdf`;
  }
}
