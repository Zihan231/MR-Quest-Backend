import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CertificatesService } from './certificates.service';
import { ApplyCertificateDto } from './dto/apply-certificate.dto';
import { RejectCertificateDto } from './dto/reject-certificate.dto';
import type { Response } from 'express';
@Controller('certificates')
@UseGuards(JwtAuthGuard)
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('eligibility/:courseId')
  async getEligibility(@Param('courseId') courseId: string, @Req() req: any) {
    return this.certificatesService.getEligibility(
      courseId,
      req.user.userId,
    );
  }

  @Post('apply')
  async apply(@Body() dto: ApplyCertificateDto, @Req() req: any) {
    return this.certificatesService.apply(dto.courseId, req.user.userId);
  }

  @Get('mine')
  async getMine(
    @Query('courseId') courseId: string | undefined,
    @Req() req: any,
  ) {
    return this.certificatesService.getMine(req.user.userId, courseId);
  }

  @Get('course/:courseId')
  async getCourseApplications(
    @Param('courseId') courseId: string,
    @Req() req: any,
  ) {
    return this.certificatesService.getCourseApplications(
      courseId,
      req.user.userId,
    );
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { filePath, filename } =
      await this.certificatesService.getPdfPath(+id, req.user.userId);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.sendFile(filePath);
  }

  @Get(':id')
  async getApplicationDetail(@Param('id') id: string, @Req() req: any) {
    return this.certificatesService.getApplicationDetail(
      +id,
      req.user.userId,
    );
  }

  @Post(':id/generate')
  async generate(@Param('id') id: string, @Req() req: any) {
    return this.certificatesService.generate(+id, req.user.userId);
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectCertificateDto,
    @Req() req: any,
  ) {
    return this.certificatesService.reject(+id, req.user.userId, dto.reason);
  }
}
