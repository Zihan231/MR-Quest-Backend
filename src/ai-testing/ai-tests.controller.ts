import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, UploadedFile, UseInterceptors, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AiTestingService } from './ai-testing.service';
import { CreateAiTestDto } from './dto/create-ai-test.dto';
import { CreatePracticeTestDto } from './dto/create-practice-test.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tests/ai')
export class AiTestsController {
  private readonly logger = new Logger(AiTestsController.name);
  constructor(private readonly aiTestingService: AiTestingService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generateTest(@Body() createDto: CreateAiTestDto, @Req() req: any) {
    this.logger.log(`generateTest hit by user=${req.user?.userId} role=${req.user?.role} lessonId=${createDto?.lessonId}`);
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      this.logger.warn(`Forbidden generateTest role=${role}`);
      throw new ForbiddenException(
        'Only admin or employee can generate AI tests',
      );
    }
    this.logger.log(`createAiTest starting for lesson=${createDto?.lessonId}`);
    const result = await this.aiTestingService.createAiTest(createDto, req.user.userId);
    this.logger.log(`createAiTest completed requestId=${result?.requestId} status=${result?.status}`);
    return result;
  }

  @Get('requests/:id')
  @UseGuards(JwtAuthGuard)
  async getGenerationRequest(@Param('id') id: string, @Req() req: any) {
    this.logger.log(`getGenerationRequest id=${id} by=${req.user?.userId}`);
    return this.aiTestingService.getGenerationRequest(
      +id,
      req.user?.userId,
      req.user?.role,
    );
  }

  @Get('requests')
  @UseGuards(JwtAuthGuard)
  async getGenerationRequests(@Query('lessonId') lessonId: string) {
    if (!lessonId) {
      return [];
    }
    return this.aiTestingService.getGenerationRequestsByLesson(+lessonId);
  }

  @Post('practice/generate')
  @UseGuards(JwtAuthGuard)
  async generatePracticeTest(@Body() createDto: CreatePracticeTestDto, @Req() req: any) {
    this.logger.log(`generatePracticeTest hit by user=${req.user?.userId} role=${req.user?.role} lessonId=${createDto?.lessonId}`);
    const result = await this.aiTestingService.createPracticeTest(createDto, req.user.userId);
    this.logger.log(`generatePracticeTest completed requestId=${result?.requestId} status=${result?.status}`);
    return result;
  }

  @Post('upload-document')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/ai-documents',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (
          file.mimetype.match(
            /\/(pdf|vnd.openxmlformats-officedocument.wordprocessingml.document)$/,
          ) ||
          file.originalname.match(/\.(pdf|docx)$/i)
        ) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException('Only PDF and DOCX files are allowed.'),
            false,
          );
        }
      },
    }),
  )
  async uploadDocument(@UploadedFile() file: any, @Req() req: any) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin or employee can upload documents',
      );
    }
    if (!file) {
      throw new BadRequestException('Document file is required');
    }
    return {
      url: `/uploads/ai-documents/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    };
  }
}
