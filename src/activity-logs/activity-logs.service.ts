import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityLog } from './entities/activity-log.entity';
import { User } from '../auth/entities/user.entity';

export interface LogEntry {
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType?: string;
  targetName?: string;
  targetId?: string;
  courseId?: string;
  details?: any;
}

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly logRepo: Repository<ActivityLog>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Fire-and-forget audit logging. Never throws — logging must never break a
   * request, even if the DB write fails.
   */
  async log(entry: LogEntry): Promise<void> {
    try {
      const log = this.logRepo.create(entry);
      await this.logRepo.save(log);
    } catch (err: any) {
      this.logger.error(`[ActivityLog] Failed to write log entry: ${err?.message}`);
    }
  }

  private async assertAdmin(requesterId: string): Promise<User> {
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Authenticated user ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin') {
      throw new ForbiddenException(
        'Only admin users can view activity logs',
      );
    }
    return requester;
  }

  async findAll(
    requesterId: string,
    filters: {
      page?: number;
      limit?: number;
      q?: string;
      action?: string;
      targetType?: string;
      actorId?: string;
      from?: string;
      to?: string;
      sortOrder?: 'ASC' | 'DESC';
    } = {},
  ) {
    await this.assertAdmin(requesterId);

    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.logRepo.createQueryBuilder('log');

    if (filters.q) {
      qb.where(
        '(log.action ILike :q OR log.actorName ILike :q OR log.targetName ILike :q OR log.targetId ILike :q OR log.actorId ILike :q)',
        { q: `%${filters.q}%` },
      );
    }
    if (filters.action && !filters.q) qb.andWhere('log.action = :action', { action: filters.action });
    if (filters.targetType && !filters.q) qb.andWhere('log.targetType = :targetType', { targetType: filters.targetType });
    if (filters.actorId && !filters.q) qb.andWhere('log.actorId = :actorId', { actorId: filters.actorId });
    if (filters.from) qb.andWhere('log.createdAt >= :from', { from: new Date(filters.from) });
    if (filters.to) qb.andWhere('log.createdAt <= :to', { to: new Date(filters.to) });

    const sortOrder = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy('log.createdAt', sortOrder)
      .skip(skip)
      .take(limit);

    const [data, totalItems] = await Promise.all([
      qb.getMany(),
      qb.getCount(),
    ]);

    return {
      data,
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async findByCourse(
    requesterId: string,
    courseId: string,
    filters: { page?: number; limit?: number } = {},
  ) {
    await this.assertAdmin(requesterId);

    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 50, 100);
    const skip = (page - 1) * limit;

    const qb = this.logRepo.createQueryBuilder('log');
    qb.where('log.courseId = :courseId', { courseId });
    qb.orderBy('log.createdAt', 'DESC').skip(skip).take(limit);

    const [data, totalItems] = await Promise.all([qb.getMany(), qb.getCount()]);

    return {
      data,
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async getActions(requesterId: string): Promise<string[]> {
    await this.assertAdmin(requesterId);
    const rows = await this.logRepo
      .createQueryBuilder('log')
      .select('DISTINCT log.action', 'action')
      .orderBy('log.action', 'ASC')
      .getRawMany();
    return rows.map((r) => r.action);
  }
}
