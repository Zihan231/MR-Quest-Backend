import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MonitoringService } from './monitoring.service';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { AtRiskQueryDto } from './dto/at-risk-query.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { ScoreDistributionQueryDto } from './dto/score-distribution-query.dto';

@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  private assertAdmin(req: any) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException(
        'Only admin users can access monitoring data',
      );
    }
  }

  @Get('leaderboard')
  @UseGuards(JwtAuthGuard)
  async getLeaderboard(@Query() query: LeaderboardQueryDto, @Req() req: any) {
    this.assertAdmin(req);
    return this.monitoringService.getLeaderboard(
      query.division,
      query.district,
      query.upazila,
      query.examGroupId,
      query.limit,
    );
  }

  @Get('region-stats')
  @UseGuards(JwtAuthGuard)
  async getRegionStats(@Req() req: any) {
    this.assertAdmin(req);
    return this.monitoringService.getRegionStats();
  }

  @Get('at-risk')
  @UseGuards(JwtAuthGuard)
  async getAtRiskUsers(@Query() query: AtRiskQueryDto, @Req() req: any) {
    this.assertAdmin(req);
    return this.monitoringService.getAtRiskUsers(query.threshold);
  }

  @Get('activity')
  @UseGuards(JwtAuthGuard)
  async getActivity(@Query() query: ActivityQueryDto, @Req() req: any) {
    this.assertAdmin(req);
    return this.monitoringService.getActivity(query.days);
  }

  @Get('users/:userId/weakness-analysis')
  @UseGuards(JwtAuthGuard)
  async getWeaknessAnalysis(@Param('userId') userId: string, @Req() req: any) {
    this.assertAdmin(req);
    return this.monitoringService.getWeaknessAnalysis(userId);
  }

  @Get('score-distribution')
  @UseGuards(JwtAuthGuard)
  async getScoreDistribution(
    @Query() query: ScoreDistributionQueryDto,
    @Req() req: any,
  ) {
    this.assertAdmin(req);
    return this.monitoringService.getScoreDistribution(
      query.examGroupId,
      query.division,
      query.district,
      query.upazila,
    );
  }

  @Get('exam-region-report/:examGroupId')
  @UseGuards(JwtAuthGuard)
  async getExamRegionReport(
    @Param('examGroupId') examGroupId: string,
    @Req() req: any,
  ) {
    this.assertAdmin(req);
    return this.monitoringService.getExamRegionReport(+examGroupId);
  }

  @Get('regions/export')
  @UseGuards(JwtAuthGuard)
  async exportRegionStats(@Req() req: any) {
    this.assertAdmin(req);
    return this.monitoringService.exportRegionStats();
  }
}
