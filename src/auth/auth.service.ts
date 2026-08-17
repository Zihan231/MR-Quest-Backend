import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import * as fs from 'fs';
import { join } from 'path';
import { ExamGroupSubmission } from '../exam-groups/entities/exam-group-submission.entity';
import { ExamGroupAnswer } from '../exam-groups/entities/exam-group-answer.entity';
import { ExamGroupQuestion } from '../exam-groups/entities/exam-group-question.entity';
import { ExamGroup } from '../exam-groups/entities/exam-group.entity';

export interface UserListFilters {
  page: number;
  limit: number;
  division?: string;
  district?: string;
  upazila?: string;
  role?: string;
  q?: string;
  minTotalMarks?: number;
  maxTotalMarks?: number;
  minAvg?: number;
  maxAvg?: number;
  activeWithinDays?: number;
  examGroupId?: number;
  performanceLevel?: string;
  sortBy?: 'marks' | 'name' | 'date';
  order?: 'ASC' | 'DESC';
}

export interface UserRow {
  id: number;
  userId: string;
  email: string;
  name: string;
  role: string;
  phoneNumber: string | null;
  address: string | null;
  division: string | null;
  district: string | null;
  upazila: string | null;
  profilePictureUrl: string | null;
  createdAt: Date;
  totalExams: number;
  totalMarks: number;
  avgScore: number;
  bestScore: number;
  performanceLevel: string | null;
  lastActiveAt: Date | null;
  rank: number;
}

export interface UserExamRecord {
  submissionId: number;
  examGroupId: number;
  examTitle: string;
  marksObtained: number;
  totalMarks: number;
  scorePercent: number;
  status: string;
  submittedAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ExamGroupSubmission)
    private readonly submissionRepository: Repository<ExamGroupSubmission>,
    @InjectRepository(ExamGroupAnswer)
    private readonly answerRepository: Repository<ExamGroupAnswer>,
    @InjectRepository(ExamGroupQuestion)
    private readonly questionRepository: Repository<ExamGroupQuestion>,
    @InjectRepository(ExamGroup)
    private readonly examGroupRepository: Repository<ExamGroup>,
    private readonly jwtService: JwtService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async signToken(userId: string, role: string): Promise<string> {
    return this.jwtService.sign({ userId, role });
  }

  private async generateNextUserId(): Promise<string> {
    const lastUser = await this.userRepository.findOne({
      where: {},
      order: { id: 'DESC' },
    });
    if (!lastUser || !lastUser.userId) {
      return 'TX-0001';
    }
    const match = lastUser.userId.match(/TX-(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 1;
    return `TX-${String(nextNum).padStart(4, '0')}`;
  }

  async createEmployee(
    createEmployeeDto: CreateEmployeeDto,
    requesterId: string,
  ): Promise<Omit<User, 'password'>> {
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Admin user with ID ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin') {
      throw new ForbiddenException('Only admin users can add employees');
    }

    const existingUser = await this.userRepository.findOne({
      where: { email: createEmployeeDto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const userId = await this.generateNextUserId();
    const hashedPassword = await bcrypt.hash(createEmployeeDto.password, 10);
    const newUser = this.userRepository.create({
      ...createEmployeeDto,
      userId,
      password: hashedPassword,
      role: 'employee', // Always force employee role
    });

    const savedUser = await this.userRepository.save(newUser);
    const { password, ...result } = savedUser;

    await this.activityLogsService.log({
      actorId: requesterId,
      actorName: requester.name,
      actorRole: requester.role,
      action: 'EMPLOYEE_CREATED',
      targetType: 'User',
      targetName: result.name,
      targetId: result.userId,
      details: { email: result.email, role: result.role },
    });

    return result;
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ user: Omit<User, 'password'>; token: string }> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        userId: true,
        role: true,
        phoneNumber: true,
        address: true,
        division: true,
        district: true,
        upazila: true,
        profilePictureUrl: true,
      }, // Explicitly fetch password
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = await this.signToken(user.userId, user.role);
    const { password, ...result } = user;

    return { user: result, token };
  }

  async resetPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { userId },
      select: {
        id: true,
        password: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await this.userRepository.save(user);

    return { message: 'Password reset successfully' };
  }

  async getUserProfile(userId: string): Promise<Omit<User, 'password'>> {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    const { password, ...result } = user;
    return result;
  }

  async updateUserDetails(
    userId: string,
    updateUserDto: UpdateUserDto,
    requesterId: string,
  ): Promise<Omit<User, 'password'>> {
    // Verify identity: only the user themselves or an admin can update the profile
    if (requesterId !== userId) {
      const requester = await this.userRepository.findOne({
        where: { userId: requesterId },
      });
      if (!requester || requester.role !== 'admin') {
        throw new ForbiddenException('You can only update your own profile');
      }
    }

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    // If a new profile picture is being set, delete the old one from disk
    if (
      updateUserDto.profilePictureUrl &&
      user.profilePictureUrl &&
      updateUserDto.profilePictureUrl !== user.profilePictureUrl
    ) {
      const oldPath = join(process.cwd(), user.profilePictureUrl);
      console.log(
        `[DP DELETE] Old URL: "${user.profilePictureUrl}" | Built path: "${oldPath}" | Exists: ${fs.existsSync(oldPath)}`,
      );
      try {
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
          this.logger.log(`Deleted old profile picture: ${oldPath}`);
          console.log(`[DP DELETE] SUCCESS: Deleted ${oldPath}`);
        } else {
          console.log(`[DP DELETE] File not found at: ${oldPath}`);
        }
      } catch (err) {
        this.logger.error(
          `Failed to delete old profile picture: ${oldPath}`,
          err,
        );
        console.error(`[DP DELETE] ERROR:`, err);
      }
    } else {
      console.log(
        `[DP DELETE] Skipped. newUrl="${updateUserDto.profilePictureUrl}" oldUrl="${user.profilePictureUrl}"`,
      );
    }

    Object.assign(user, updateUserDto);
    const saved = await this.userRepository.save(user);
    const { password, ...result } = saved;

    // Audit log — resolve the actual actor for accuracy (admin may edit another user)
    let actorName = result.name;
    let actorRole = result.role;
    if (requesterId !== result.userId) {
      const actor = await this.userRepository.findOne({
        where: { userId: requesterId },
      });
      if (actor) {
        actorName = actor.name;
        actorRole = actor.role;
      }
    }
    await this.activityLogsService.log({
      actorId: requesterId,
      actorName,
      actorRole,
      action: 'PROFILE_UPDATED',
      targetType: 'User',
      targetName: result.name,
      targetId: result.userId,
      details: {
        changedFields: Object.keys(updateUserDto).filter(
          (k) => (updateUserDto as any)[k] !== undefined,
        ),
      },
    });

    return result;
  }

  async updateUserRole(
    userId: string,
    role: string,
    adminUserId: string,
  ): Promise<Omit<User, 'password'>> {
    const adminUser = await this.userRepository.findOne({
      where: { userId: adminUserId },
    });
    if (!adminUser) {
      throw new NotFoundException(
        `Admin user with ID ${adminUserId} not found`,
      );
    }
    if (adminUser.role !== 'admin') {
      throw new ForbiddenException('Only admin users can modify user roles');
    }
    if (role !== 'user' && role !== 'employee' && role !== 'admin') {
      throw new BadRequestException(
        'Invalid role name. Must be user, employee, or admin',
      );
    }

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    const oldRole = user.role;
    user.role = role;
    const saved = await this.userRepository.save(user);
    const { password, ...result } = saved;

    await this.activityLogsService.log({
      actorId: adminUserId,
      actorName: adminUser.name,
      actorRole: adminUser.role,
      action: 'ROLE_CHANGED',
      targetType: 'User',
      targetName: result.name,
      targetId: result.userId,
      details: { userId: result.userId, fromRole: oldRole, toRole: role },
    });

    return result;
  }

  async searchUsers(query: string): Promise<Omit<User, 'password'>[]> {
    const users = await this.userRepository.find({
      where: [
        { name: ILike(`%${query}%`) },
        { email: ILike(`%${query}%`) },
        { role: ILike(`%${query}%`) },
        { userId: ILike(`%${query}%`) },
      ],
    });
    return users.map(
      ({ password, ...userWithoutPassword }) => userWithoutPassword,
    );
  }

  async getAllUsers(): Promise<Omit<User, 'password'>[]> {
    const users = await this.userRepository.find();
    return users.map(
      ({ password, ...userWithoutPassword }) => userWithoutPassword,
    );
  }

  async getUsersPaginated(
    page: number = 1,
    limit: number = 10,
    filters: Partial<UserListFilters> = {},
  ): Promise<{ data: UserRow[]; meta: any }> {
    const rows = await this.buildUserRows(filters);
    const total = rows.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const skippedItems = (currentPage - 1) * limit;

    return {
      data: rows.slice(skippedItems, skippedItems + limit),
      meta: {
        totalItems: total,
        itemCount: rows.slice(skippedItems, skippedItems + limit).length,
        itemsPerPage: limit,
        totalPages,
        currentPage,
      },
    };
  }

  async exportUsersCsv(
    filters: Partial<UserListFilters>,
  ): Promise<{ csv: string; count: number }> {
    const rows = await this.buildUserRows(filters);
    const headers = [
      'userId',
      'name',
      'email',
      'phoneNumber',
      'role',
      'division',
      'district',
      'upazila',
      'totalExams',
      'totalMarks',
      'avgScore',
      'bestScore',
      'performanceLevel',
      'joinedAt',
      'lastActiveAt',
    ];

    const escapeCsv = (value: any): string => {
      const str = value === null || value === undefined ? '' : String(value);
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        [
          row.userId,
          row.name,
          row.email,
          row.phoneNumber,
          row.role,
          row.division,
          row.district,
          row.upazila,
          row.totalExams,
          row.totalMarks,
          row.avgScore,
          row.bestScore,
          row.performanceLevel,
          row.createdAt,
          row.lastActiveAt,
        ]
          .map(escapeCsv)
          .join(','),
      ),
    ];

    return { csv: lines.join('\n'), count: rows.length };
  }

  async getUserPerformance(userId: string): Promise<{
    profile: Omit<User, 'password'>;
    overall: {
      totalExams: number;
      totalMarks: number;
      avgScore: number;
      bestScore: number;
      performanceLevel: string | null;
    };
    examHistory: (UserExamRecord & {
      rank: number;
      totalParticipants: number;
    })[];
    weaknessAnalysis: {
      totalPossible: number;
      totalAwarded: number;
      overallPercent: number;
      breakdown: {
        type: string;
        questionCount: number;
        maxMarks: number;
        awardedMarks: number;
        percent: number;
      }[];
      video: {
        accuracy: { max: number; awarded: number; percent: number };
      } | null;
    };
    trend: {
      date: Date;
      examTitle: string;
      scorePercent: number;
      marks: number;
    }[];
  }> {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    const { password, ...profile } = user;

    const submissions = await this.submissionRepository.find({
      where: { user: { id: user.id } },
      relations: {
        examGroup: { questions: true },
        answers: { question: true },
      },
      order: { submittedAt: 'ASC' },
    });

    const records: UserExamRecord[] = [];
    for (const sub of submissions) {
      const totalMarks = (sub.examGroup?.questions || []).reduce(
        (sum, q) => sum + (q.marks || 0),
        0,
      );
      records.push({
        submissionId: sub.id,
        examGroupId: sub.examGroup?.id,
        examTitle: sub.examGroup?.title || 'Unknown exam',
        marksObtained: sub.marksObtained,
        totalMarks,
        scorePercent:
          totalMarks > 0
            ? Math.round((sub.marksObtained / totalMarks) * 1000) / 10
            : 0,
        status: sub.status,
        submittedAt: sub.submittedAt || sub.createdAt,
      });
    }

    const overall = this.computeOverallStats(records);

    // Rank in each exam: count how many participants scored more
    const examHistory: (UserExamRecord & {
      rank: number;
      totalParticipants: number;
    })[] = [];
    for (const record of records) {
      const allSubs = await this.submissionRepository.find({
        where: { examGroup: { id: record.examGroupId } },
        relations: { user: true },
      });
      const sorted = allSubs
        .filter((s) => s.user)
        .sort((a, b) => b.marksObtained - a.marksObtained);
      const totalParticipants = sorted.length;
      const foundIndex = sorted.findIndex((s) => s.user.id === user.id);
      const rank = foundIndex >= 0 ? foundIndex + 1 : sorted.length + 1;
      examHistory.push({ ...record, rank, totalParticipants });
    }

    const weaknessAnalysis = this.computeWeaknessAnalysis(submissions);

    const trend = records.map((r) => ({
      date: r.submittedAt,
      examTitle: r.examTitle,
      scorePercent: r.scorePercent,
      marks: r.marksObtained,
    }));

    return { profile, overall, examHistory, weaknessAnalysis, trend };
  }

  private computeOverallStats(records: UserExamRecord[]) {
    if (records.length === 0) {
      return {
        totalExams: 0,
        totalMarks: 0,
        avgScore: 0,
        bestScore: 0,
        performanceLevel: null,
      };
    }
    const totalMarks = records.reduce((sum, r) => sum + r.marksObtained, 0);
    const avgScore =
      records.reduce((sum, r) => sum + r.scorePercent, 0) / records.length;
    const bestScore = Math.max(...records.map((r) => r.scorePercent));
    return {
      totalExams: records.length,
      totalMarks,
      avgScore: Math.round(avgScore * 10) / 10,
      bestScore,
      performanceLevel: this.getPerformanceLevel(avgScore),
    };
  }

  private getPerformanceLevel(avgScore: number): string {
    if (avgScore >= 80) return 'good';
    if (avgScore >= 60) return 'average';
    if (avgScore >= 40) return 'below-average';
    return 'poor';
  }

  private computeWeaknessAnalysis(submissions: ExamGroupSubmission[]) {
    const breakdownMap = new Map<
      string,
      {
        type: string;
        questionCount: number;
        maxMarks: number;
        awardedMarks: number;
      }
    >();
    const video = {
      accuracy: { max: 0, awarded: 0 },
    };
    let videoCount = 0;

    for (const sub of submissions) {
      for (const answer of sub.answers || []) {
        const question = answer.question;
        if (!question) continue;
        const type = question.type || 'MCQ';
        const entry = breakdownMap.get(type) || {
          type,
          questionCount: 0,
          maxMarks: 0,
          awardedMarks: 0,
        };
        entry.questionCount += 1;
        entry.maxMarks += question.marks || 0;
        entry.awardedMarks += answer.marksAwarded || 0;
        breakdownMap.set(type, entry);

        if (type === 'Video') {
          videoCount += 1;
          video.accuracy.max += question.accuracyMarks || 0;
          let parsed: any = null;
          if (answer.evaluatorComment) {
            try {
              parsed = JSON.parse(answer.evaluatorComment);
            } catch {
              parsed = null;
            }
          }
          video.accuracy.awarded += parsed?.accuracyScore || 0;
        }
      }
    }

    const breakdown = Array.from(breakdownMap.values()).map((entry) => ({
      ...entry,
      percent:
        entry.maxMarks > 0
          ? Math.round((entry.awardedMarks / entry.maxMarks) * 1000) / 10
          : 0,
    }));

    const totalPossible = breakdown.reduce((sum, b) => sum + b.maxMarks, 0);
    const totalAwarded = breakdown.reduce((sum, b) => sum + b.awardedMarks, 0);

    return {
      totalPossible,
      totalAwarded,
      overallPercent:
        totalPossible > 0
          ? Math.round((totalAwarded / totalPossible) * 1000) / 10
          : 0,
      breakdown,
      video:
        videoCount > 0
          ? {
              accuracy: {
                ...video.accuracy,
                percent:
                  video.accuracy.max > 0
                    ? Math.round(
                        (video.accuracy.awarded / video.accuracy.max) * 1000,
                      ) / 10
                    : 0,
              },
            }
          : null,
    };
  }

  private async buildUserRows(
    filters: Partial<UserListFilters>,
  ): Promise<UserRow[]> {
    const {
      division,
      district,
      upazila,
      role,
      q,
      minTotalMarks,
      maxTotalMarks,
      minAvg,
      maxAvg,
      activeWithinDays,
      examGroupId,
      performanceLevel,
      sortBy = 'date',
      order = 'DESC',
    } = filters;

    const where: any = {};
    if (division) where.division = division;
    if (district) where.district = district;
    if (upazila) where.upazila = upazila;
    if (role) where.role = role;

    const whereClause = q
      ? [
          { ...where, name: ILike(`%${q}%`) },
          { ...where, email: ILike(`%${q}%`) },
          { ...where, userId: ILike(`%${q}%`) },
        ]
      : where;

    const users = await this.userRepository.find({
      where: whereClause,
    });

    if (users.length === 0) return [];

    const userIds = users.map((u) => u.id);
    const submissions = await this.submissionRepository.find({
      where: { user: { id: In(userIds) } },
      relations: { examGroup: { questions: true }, user: true },
    });

    const grouped = new Map<number, ExamGroupSubmission[]>();
    for (const sub of submissions) {
      const uid = sub.user?.id;
      if (!uid) continue;
      if (!grouped.has(uid)) grouped.set(uid, []);
      grouped.get(uid)!.push(sub);
    }

    const activeThreshold = activeWithinDays
      ? new Date(Date.now() - activeWithinDays * 24 * 60 * 60 * 1000)
      : null;

    const rows: UserRow[] = [];

    for (const user of users) {
      const userSubs = grouped.get(user.id) || [];
      const records: UserExamRecord[] = userSubs.map((sub) => {
        const totalMarks = (sub.examGroup?.questions || []).reduce(
          (sum, q) => sum + (q.marks || 0),
          0,
        );
        return {
          submissionId: sub.id,
          examGroupId: sub.examGroup?.id,
          examTitle: sub.examGroup?.title || '',
          marksObtained: sub.marksObtained,
          totalMarks,
          scorePercent:
            totalMarks > 0
              ? Math.round((sub.marksObtained / totalMarks) * 1000) / 10
              : 0,
          status: sub.status,
          submittedAt: sub.submittedAt || sub.createdAt,
        };
      });

      const overall = this.computeOverallStats(records);

      if (minTotalMarks !== undefined && overall.totalMarks < minTotalMarks)
        continue;
      if (maxTotalMarks !== undefined && overall.totalMarks > maxTotalMarks)
        continue;
      if (minAvg !== undefined && overall.avgScore < minAvg) continue;
      if (maxAvg !== undefined && overall.avgScore > maxAvg) continue;
      if (
        performanceLevel &&
        overall.performanceLevel !== performanceLevel
      )
        continue;
      if (examGroupId && !records.some((r) => r.examGroupId === examGroupId))
        continue;
      if (
        activeThreshold &&
        !records.some((r) => new Date(r.submittedAt) >= activeThreshold)
      )
        continue;

      const lastActiveAt =
        records.length > 0
          ? new Date(
              Math.max(
                ...records.map((r) => new Date(r.submittedAt).getTime()),
              ),
            )
          : null;

      rows.push({
        id: user.id,
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        phoneNumber: user.phoneNumber || null,
        address: user.address || null,
        division: user.division || null,
        district: user.district || null,
        upazila: user.upazila || null,
        profilePictureUrl: user.profilePictureUrl || null,
        createdAt: user.createdAt,
        totalExams: overall.totalExams,
        totalMarks: overall.totalMarks,
        avgScore: overall.avgScore,
        bestScore: overall.bestScore,
        performanceLevel: overall.performanceLevel,
        lastActiveAt,
        rank: 0,
      });
    }

    const sortKeyMap: Record<string, (r: UserRow) => number | string> = {
      marks: (r) => r.totalMarks,
      name: (r) => r.name.toLowerCase(),
      date: (r) => new Date(r.createdAt).getTime(),
    };
    const getSortKey = sortKeyMap[sortBy] || sortKeyMap.date;
    const dir = order === 'ASC' ? 1 : -1;
    rows.sort((a, b) => {
      const av = getSortKey(a);
      const bv = getSortKey(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    // Rank users by performance (total marks desc, then avg score desc),
    // independent of the display sort order
    const byPerformance = [...rows].sort(
      (a, b) => b.totalMarks - a.totalMarks || b.avgScore - a.avgScore,
    );
    byPerformance.forEach((row, index) => {
      row.rank = index + 1;
    });

    return rows;
  }
}
