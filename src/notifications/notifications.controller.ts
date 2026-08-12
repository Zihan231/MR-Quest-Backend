import {
  Controller,
  Get,
  UseGuards,
  Req,
  Put,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Notification } from './notification.entity';
import { User } from '../auth/entities/user.entity';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get()
  async getNotifications(@Req() req: any) {
    const user = await this.userRepository.findOne({
      where: { userId: req.user.userId },
    });
    if (!user) return [];

    return this.notificationRepository.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  @Put('read-all')
  async markAllRead(@Req() req: any) {
    const user = await this.userRepository.findOne({
      where: { userId: req.user.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('"userId" = :userId', { userId: user.id })
      .andWhere('"isRead" = false')
      .execute();

    return { success: true, updated: result.affected || 0 };
  }

  @Put(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    const user = await this.userRepository.findOne({
      where: { userId: req.user.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('"id" = :id', { id: +id })
      .andWhere('"userId" = :userId', { userId: user.id })
      .execute();

    if (!result.affected) {
      throw new NotFoundException('Notification not found');
    }

    return { success: true };
  }
}
