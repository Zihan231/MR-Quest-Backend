import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  Param,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivityLogsService } from './activity-logs.service';

@Controller('activity-logs')
@UseGuards(JwtAuthGuard)
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  async findAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.activityLogsService.findAll(req.user.userId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q,
      action,
      targetType,
      actorId,
      from,
      to,
      sortOrder,
    });
  }

  @Get('actions')
  async getActions(@Req() req: any) {
    return this.activityLogsService.getActions(req.user.userId);
  }

  @Get('course/:courseId')
  async findByCourse(
    @Req() req: any,
    @Param('courseId') courseId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activityLogsService.findByCourse(req.user.userId, courseId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
