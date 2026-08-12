import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ExamGroup } from './entities/exam-group.entity';

export const TRASH_RETENTION_MS = 60 * 1000; // TODO: change to 30 * 24 * 60 * 60 * 1000 (30 days) for production

@Injectable()
export class TrashCleanupService {
  private readonly logger = new Logger(TrashCleanupService.name);

  constructor(
    @InjectRepository(ExamGroup)
    private readonly examGroupRepo: Repository<ExamGroup>,
  ) {}

  // Run every 10 seconds to purge items deleted more than 1 minute ago (testing)
  // TODO: change to a daily schedule and a 30-day retention for production
  @Cron('*/10 * * * * *')
  async purgeExpiredTrash() {
    const cutoffDate = new Date(Date.now() - TRASH_RETENTION_MS);

    const expired = await this.examGroupRepo.find({
      where: { deletedAt: LessThan(cutoffDate) },
      withDeleted: true,
    });

    if (expired.length === 0) {
      return;
    }

    this.logger.log(
      `Purging ${expired.length} expired exam group(s) from the recycle bin...`,
    );

    await this.examGroupRepo
      .createQueryBuilder()
      .delete()
      .from(ExamGroup)
      .where('deletedAt IS NOT NULL')
      .andWhere('deletedAt < :cutoff', { cutoff: cutoffDate })
      .execute();
  }
}
