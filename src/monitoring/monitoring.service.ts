import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { ExamGroup } from '../exam-groups/entities/exam-group.entity';
import { ExamGroupSubmission } from '../exam-groups/entities/exam-group-submission.entity';
import { ExamGroupQuestion } from '../exam-groups/entities/exam-group-question.entity';
import { ExamGroupEnrollment } from '../exam-groups/entities/exam-group-enrollment.entity';
import { ExamGroupAnswer } from '../exam-groups/entities/exam-group-answer.entity';
import { AuthService } from '../auth/auth.service';

export interface StudentStats {
  userId: string;
  name: string;
  email: string;
  division: string | null;
  district: string | null;
  upazila: string | null;
  totalExams: number;
  totalMarks: number;
  avgScore: number;
  bestScore: number;
}

interface ExamRecord {
  examGroupId: number;
  examTitle: string;
  marksObtained: number;
  totalMarks: number;
  scorePercent: number;
  status: string;
  submittedAt: Date;
}

interface RegionAccumulator {
  name: string;
  division?: string;
  participants: Set<number>;
  submissions: number;
  totalPercent: number;
  userScores: Map<number, { userId: string; name: string; score: number }>;
}

@Injectable()
export class MonitoringService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ExamGroup)
    private readonly examGroupRepository: Repository<ExamGroup>,
    @InjectRepository(ExamGroupSubmission)
    private readonly submissionRepository: Repository<ExamGroupSubmission>,
    @InjectRepository(ExamGroupQuestion)
    private readonly questionRepository: Repository<ExamGroupQuestion>,
    @InjectRepository(ExamGroupEnrollment)
    private readonly enrollmentRepository: Repository<ExamGroupEnrollment>,
    @InjectRepository(ExamGroupAnswer)
    private readonly answerRepository: Repository<ExamGroupAnswer>,
    private readonly authService: AuthService,
  ) {}

  private async loadStudentStats(
    division?: string,
    district?: string,
    upazila?: string,
    examGroupId?: number,
  ): Promise<StudentStats[]> {
    const where: any = { role: 'user' };
    if (division) where.division = division;
    if (district) where.district = district;
    if (upazila) where.upazila = upazila;

    const users = await this.userRepository.find({ where });

    let submissions: ExamGroupSubmission[];
    if (users.length === 0) {
      submissions = [];
    } else {
      const submissionWhere: any = { user: { id: In(users.map((u) => u.id)) } };
      if (examGroupId) submissionWhere.examGroup = { id: examGroupId };
      submissions = await this.submissionRepository.find({
        where: submissionWhere,
        relations: { examGroup: { questions: true }, user: true },
      });
    }

    const grouped = new Map<number, ExamGroupSubmission[]>();
    for (const sub of submissions) {
      const uid = sub.user?.id;
      if (!uid) continue;
      if (!grouped.has(uid)) grouped.set(uid, []);
      grouped.get(uid)!.push(sub);
    }

    const stats: StudentStats[] = [];
    for (const user of users) {
      const userSubs = grouped.get(user.id) || [];
      if (userSubs.length === 0) continue;

      const records: ExamRecord[] = userSubs.map((sub) => {
        const totalMarks = (sub.examGroup?.questions || []).reduce(
          (sum, q) => sum + (q.marks || 0),
          0,
        );
        return {
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

      const avgScore =
        records.reduce((sum, r) => sum + r.scorePercent, 0) / records.length;
      stats.push({
        userId: user.userId,
        name: user.name,
        email: user.email,
        division: user.division || null,
        district: user.district || null,
        upazila: user.upazila || null,
        totalExams: records.length,
        totalMarks: records.reduce((sum, r) => sum + r.marksObtained, 0),
        avgScore: Math.round(avgScore * 10) / 10,
        bestScore: Math.max(...records.map((r) => r.scorePercent)),
      });
    }

    return stats;
  }

  async getLeaderboard(
    division?: string,
    district?: string,
    upazila?: string,
    examGroupId?: number,
    limit: number = 10,
  ) {
    const stats = await this.loadStudentStats(
      division,
      district,
      upazila,
      examGroupId,
    );
    stats.sort((a, b) => b.avgScore - a.avgScore);
    return stats.slice(0, limit).map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));
  }

  async getRegionStats() {
    const users = await this.userRepository.find({ where: { role: 'user' } });
    const submissions = await this.submissionRepository.find({
      relations: { examGroup: { questions: true }, user: true },
    });

    const userById = new Map(users.map((u) => [u.id, u]));
    const divisions = new Map<string, RegionAccumulator>();
    const districts = new Map<string, RegionAccumulator>();

    for (const sub of submissions) {
      const user = userById.get(sub.user?.id);
      if (!user || user.role !== 'user') continue;
      const totalMarks = (sub.examGroup?.questions || []).reduce(
        (sum, q) => sum + (q.marks || 0),
        0,
      );
      const percent =
        totalMarks > 0 ? (sub.marksObtained / totalMarks) * 100 : 0;

      const divisionName = user.division || 'Unspecified';
      if (!divisions.has(divisionName)) {
        divisions.set(divisionName, {
          name: divisionName,
          participants: new Set(),
          submissions: 0,
          totalPercent: 0,
          userScores: new Map(),
        });
      }
      const division = divisions.get(divisionName)!;
      division.submissions += 1;
      division.totalPercent += percent;
      this.trackParticipant(division, user, percent);

      if (user.district) {
        const districtKey = `${divisionName}:${user.district}`;
        if (!districts.has(districtKey)) {
          districts.set(districtKey, {
            name: user.district,
            division: divisionName,
            participants: new Set(),
            submissions: 0,
            totalPercent: 0,
            userScores: new Map(),
          });
        }
        const district = districts.get(districtKey)!;
        district.submissions += 1;
        district.totalPercent += percent;
        this.trackParticipant(district, user, percent);
      }
    }

    const finalize = (entry: RegionAccumulator): any => {
      const avgScore =
        entry.submissions > 0
          ? Math.round((entry.totalPercent / entry.submissions) * 10) / 10
          : 0;
      const bestUser = Array.from(entry.userScores.entries()).sort(
        (a, b) => b[1].score - a[1].score,
      )[0];
      return {
        name: entry.name,
        participants: entry.participants.size,
        submissions: entry.submissions,
        avgScore,
        topPerformer: bestUser
          ? {
              userId: bestUser[1].userId,
              name: bestUser[1].name,
              avgScore: bestUser[1].score,
            }
          : null,
      };
    };

    const divisionRows = Array.from(divisions.values())
      .filter((d) => d.participants.size > 0)
      .map(finalize);

    const districtRows = Array.from(districts.values())
      .filter((d) => d.participants.size > 0)
      .map((d) => ({ division: d.division, ...finalize(d) }));

    return { divisions: divisionRows, districts: districtRows };
  }

  private trackParticipant(
    region: RegionAccumulator,
    user: User,
    score: number,
  ): void {
    if (!region.userScores.has(user.id)) {
      region.participants.add(user.id);
      region.userScores.set(user.id, {
        userId: user.userId,
        name: user.name,
        score: 0,
      });
    }
    const entry = region.userScores.get(user.id);
    if (entry) entry.score = score;
  }

  async getAtRiskUsers(threshold: number = 20) {
    const users = await this.userRepository.find({ where: { role: 'user' } });
    const submissions = await this.submissionRepository.find({
      where: { user: { id: In(users.map((u) => u.id)) } },
      relations: { examGroup: { questions: true }, user: true },
      order: { submittedAt: 'ASC' },
    });

    const grouped = new Map<number, ExamGroupSubmission[]>();
    for (const sub of submissions) {
      const uid = sub.user?.id;
      if (!uid) continue;
      if (!grouped.has(uid)) grouped.set(uid, []);
      grouped.get(uid)!.push(sub);
    }

    const userById = new Map(users.map((u) => [u.id, u]));
    const atRisk: any[] = [];

    for (const [uid, subs] of grouped.entries()) {
      const user = userById.get(uid);
      if (!user || subs.length < 2) continue;

      const records: ExamRecord[] = subs.map((sub) => {
        const totalMarks = (sub.examGroup?.questions || []).reduce(
          (sum, q) => sum + (q.marks || 0),
          0,
        );
        return {
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

      const evaluated = records.filter(
        (r) => r.status === 'Evaluated' && r.totalMarks > 0,
      );
      if (evaluated.length < 2) continue;

      const sortedByDate = [...evaluated].sort(
        (a, b) =>
          new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
      );
      const previous = sortedByDate[sortedByDate.length - 2];
      const latest = sortedByDate[sortedByDate.length - 1];

      if (previous.scorePercent <= 0) continue;
      const dropPercent =
        ((previous.scorePercent - latest.scorePercent) /
          previous.scorePercent) *
        100;

      if (dropPercent > threshold) {
        atRisk.push({
          userId: user.userId,
          name: user.name,
          email: user.email,
          division: user.division || null,
          district: user.district || null,
          upazila: user.upazila || null,
          dropPercent: Math.round(dropPercent * 10) / 10,
          previousExam: {
            title: previous.examTitle,
            scorePercent: previous.scorePercent,
            marks: previous.marksObtained,
            submittedAt: previous.submittedAt,
          },
          latestExam: {
            title: latest.examTitle,
            scorePercent: latest.scorePercent,
            marks: latest.marksObtained,
            submittedAt: latest.submittedAt,
          },
          poorExams: evaluated
            .filter((r) => r.scorePercent <= 40)
            .map((r) => ({
              title: r.examTitle,
              scorePercent: r.scorePercent,
              marks: r.marksObtained,
              submittedAt: r.submittedAt,
            })),
        });
      }
    }

    atRisk.sort((a, b) => b.dropPercent - a.dropPercent);
    return atRisk;
  }

  async getActivity(days: number = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const users = await this.userRepository.find({ where: { role: 'user' } });
    const submissions = await this.submissionRepository.find({
      where: { user: { id: In(users.map((u) => u.id)) } },
      relations: { user: true },
    });

    const lastActiveByUser = new Map<number, Date>();
    for (const sub of submissions) {
      const uid = sub.user?.id;
      if (!uid) continue;
      const date = sub.submittedAt || sub.createdAt;
      const prev = lastActiveByUser.get(uid);
      if (!prev || date > prev) lastActiveByUser.set(uid, date);
    }

    const active: any[] = [];
    const inactive: any[] = [];
    for (const user of users) {
      const lastActive = lastActiveByUser.get(user.id);
      const isActive = lastActive && lastActive >= cutoff;
      const entry = {
        userId: user.userId,
        name: user.name,
        email: user.email,
        division: user.division || null,
        district: user.district || null,
        upazila: user.upazila || null,
        lastActiveAt: lastActive || null,
      };
      if (isActive) active.push(entry);
      else inactive.push(entry);
    }

    return {
      days,
      totalStudents: users.length,
      activeCount: active.length,
      inactiveCount: inactive.length,
      activePercent:
        users.length > 0
          ? Math.round((active.length / users.length) * 1000) / 10
          : 0,
      active,
      inactive,
    };
  }

  async getWeaknessAnalysis(userId: string) {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    const performance = await this.authService.getUserPerformance(userId);
    return {
      userId,
      name: user.name,
      weaknessAnalysis: performance.weaknessAnalysis,
    };
  }

  async getScoreDistribution(
    examGroupId?: number,
    division?: string,
    district?: string,
    upazila?: string,
  ) {
    const where: any = {};
    if (division) where.division = division;
    if (district) where.district = district;
    if (upazila) where.upazila = upazila;
    const users = await this.userRepository.find({ where });
    if (users.length === 0) {
      return this.emptyBuckets();
    }

    const submissionWhere: any = { user: { id: In(users.map((u) => u.id)) } };
    if (examGroupId) submissionWhere.examGroup = { id: examGroupId };
    const submissions = await this.submissionRepository.find({
      where: submissionWhere,
      relations: { examGroup: { questions: true }, user: true },
    });

    const buckets = [
      { label: '0-20%', min: 0, max: 20, count: 0, users: [] as string[] },
      { label: '20-40%', min: 20, max: 40, count: 0, users: [] as string[] },
      { label: '40-60%', min: 40, max: 60, count: 0, users: [] as string[] },
      { label: '60-80%', min: 60, max: 80, count: 0, users: [] as string[] },
      {
        label: '80-100%',
        min: 80,
        max: 100.1,
        count: 0,
        users: [] as string[],
      },
    ];

    for (const sub of submissions) {
      const totalMarks = (sub.examGroup?.questions || []).reduce(
        (sum, q) => sum + (q.marks || 0),
        0,
      );
      const percent =
        totalMarks > 0 ? (sub.marksObtained / totalMarks) * 100 : 0;
      const bucket = buckets.find((b) => percent >= b.min && percent < b.max);
      if (bucket) {
        bucket.count += 1;
        if (sub.user?.userId) bucket.users.push(sub.user.userId);
      }
    }

    return {
      buckets: buckets.map((b) => ({
        label: b.label,
        count: b.count,
        students: Array.from(new Set(b.users)),
      })),
    };
  }

  private emptyBuckets() {
    return {
      buckets: [
        { label: '0-20%', count: 0, students: [] },
        { label: '20-40%', count: 0, students: [] },
        { label: '40-60%', count: 0, students: [] },
        { label: '60-80%', count: 0, students: [] },
        { label: '80-100%', count: 0, students: [] },
      ],
    };
  }

  async getExamRegionReport(examGroupId: number) {
    const examGroup = await this.examGroupRepository.findOne({
      where: { id: examGroupId },
      relations: { questions: true },
    });
    if (!examGroup) {
      throw new NotFoundException('Exam group not found');
    }

    const submissions = await this.submissionRepository.find({
      where: { examGroup: { id: examGroupId } },
      relations: { user: true },
    });

    const totalMarks = (examGroup.questions || []).reduce(
      (sum, q) => sum + (q.marks || 0),
      0,
    );

    const regionMap = new Map<
      string,
      {
        region: string;
        participants: Set<number>;
        totalPercent: number;
        best: { userId: string; name: string; percent: number } | null;
      }
    >();

    for (const sub of submissions) {
      const user = sub.user;
      if (!user) continue;
      const percent =
        totalMarks > 0 ? (sub.marksObtained / totalMarks) * 100 : 0;

      const keys = [
        { region: user.division || 'Unspecified', isDistrict: false },
        ...(user.district
          ? [
              {
                region: `${user.district} (${user.division || ''})`,
                isDistrict: true,
              },
            ]
          : []),
      ];

      for (const key of keys) {
        if (!regionMap.has(key.region)) {
          regionMap.set(key.region, {
            region: key.region,
            participants: new Set(),
            totalPercent: 0,
            best: null,
          });
        }
        const entry = regionMap.get(key.region)!;
        entry.participants.add(user.id);
        entry.totalPercent += percent;
        if (!entry.best || percent > entry.best.percent) {
          entry.best = {
            userId: user.userId,
            name: user.name,
            percent: Math.round(percent * 10) / 10,
          };
        }
      }
    }

    return {
      examGroupId: examGroup.id,
      title: examGroup.title,
      totalMarks,
      totalParticipants: submissions.length,
      regions: Array.from(regionMap.values())
        .map((entry) => ({
          region: entry.region,
          participants: entry.participants.size,
          avgScore:
            entry.participants.size > 0
              ? Math.round(
                  (entry.totalPercent / entry.participants.size) * 10,
                ) / 10
              : 0,
          topPerformer: entry.best,
        }))
        .sort((a, b) => b.avgScore - a.avgScore),
    };
  }

  async exportRegionStats(): Promise<{ csv: string; count: number }> {
    const regionStats = await this.getRegionStats();

    const escapeCsv = (value: any): string => {
      const str = value === null || value === undefined ? '' : String(value);
      if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };

    const headers = [
      'level',
      'name',
      'participants',
      'submissions',
      'avgScore',
      'topPerformerName',
      'topPerformerUserId',
    ];
    const lines = [headers.join(',')];

    const rows: any[] = [
      ...regionStats.divisions.map((r: any) => ({ level: 'Division', ...r })),
      ...regionStats.districts.map((r: any) => ({ level: 'District', ...r })),
    ];

    for (const row of rows) {
      lines.push(
        [
          row.level,
          row.name,
          row.participants,
          row.submissions,
          row.avgScore,
          row.topPerformer?.name || '',
          row.topPerformer?.userId || '',
        ]
          .map(escapeCsv)
          .join(','),
      );
    }

    return { csv: lines.join('\n'), count: rows.length };
  }
}
