import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Put,
  Delete,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { TestsService } from './tests.service';
import { ExamSchedulerService } from './exam-scheduler.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTestDto } from './dto/create-test.dto';
import { SubmitTestDto } from './dto/submit-test.dto';
import { EvaluateCqDto } from './dto/evaluate-cq.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { UpdateMarksDto } from './dto/update-marks.dto';

@Controller('tests')
@UseGuards(JwtAuthGuard)
export class TestsController {
  constructor(
    private readonly testsService: TestsService,
    private readonly examSchedulerService: ExamSchedulerService,
  ) {}

  @Post()
  async createTest(@Body() createDto: CreateTestDto, @Req() req: any) {
    const { userId, role } = req.user;
    return this.testsService.createTest(createDto, userId, role);
  }

  @Post('upload-test-video')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/test-videos',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (
          file.mimetype.match(/\/(mp4|mpeg|quicktime|webm|ogg)$/) ||
          file.originalname.match(/\.(mp4|mov|avi|webm|ogg)$/i)
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only video files are allowed.'), false);
        }
      },
    }),
  )
  async uploadTestVideo(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Video file is required');
    }
    return {
      url: `/uploads/test-videos/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
    };
  }

  @Get('lesson/:lessonId')
  async getTestsForLesson(@Param('lessonId') lessonId: string) {
    return this.testsService.getTestsForLesson(+lessonId);
  }

  @Get('practice/:lessonId')
  @UseGuards(JwtAuthGuard)
  async getMyPracticeTests(@Param('lessonId') lessonId: string, @Req() req: any) {
    return this.testsService.getMyPracticeTests(+lessonId, req.user.userId);
  }

  @Delete('practice/:testId')
  @UseGuards(JwtAuthGuard)
  async deletePracticeTest(@Param('testId') testId: string, @Req() req: any) {
    return this.testsService.deletePracticeTest(+testId, req.user.userId);
  }

  @Get('course/:courseId')
  async getTestsForCourse(@Param('courseId') courseId: string) {
    return this.testsService.getTestsForCourse(courseId);
  }

  @Get(':testId/my-submission')
  @UseGuards(JwtAuthGuard)
  async getMySubmission(@Param('testId') testId: string, @Req() req: any) {
    return this.testsService.getMySubmission(+testId, req.user.userId);
  }

  @Get('standalone/:courseId')
  async getStandaloneExamsForCourse(
    @Param('courseId') courseId: string,
    @Req() req: any,
  ) {
    const role = req.user?.role || 'user';
    return this.testsService.getStandaloneExamsForCourse(courseId, role);
  }

  @Post('submit')
  async submitTest(@Body() submitDto: SubmitTestDto, @Req() req: any) {
    return this.testsService.submitTest(submitDto, req.user.userId);
  }

  @Get('evaluations/pending')
  async getPendingEvaluations(
    @Req() req: any,
    @Query('lessonId') lessonId?: string,
    @Query('testId') testId?: string,
  ) {
    const { userId, role } = req.user;
    return this.testsService.getPendingEvaluations(
      userId,
      role,
      lessonId ? +lessonId : undefined,
      testId ? +testId : undefined,
    );
  }

  @Put('evaluations')
  async evaluateCq(@Body() evalDto: EvaluateCqDto, @Req() req: any) {
    const { userId, role } = req.user;
    return this.testsService.evaluateCq(evalDto, userId, role);
  }

  @Get('leaderboard/:lessonId')
  async getLeaderboard(@Param('lessonId') lessonId: string) {
    return this.testsService.getLeaderboard(+lessonId);
  }

  @Put('questions/:questionId')
  async updateQuestion(
    @Param('questionId') questionId: string,
    @Body()
    body: {
      questionText?: string;
      options?: string[];
      correctAnswers?: string[];
      marks?: number;
      postureMarks?: number;
      voiceMarks?: number;
      accuracyMarks?: number;
      evaluationType?: string;
      referenceScript?: string;
    },
    @Req() req: any,
  ) {
    const { role } = req.user;
    return this.testsService.updateQuestion(+questionId, body, role);
  }

  @Get('lesson/:lessonId/submissions')
  async getLessonSubmissions(
    @Param('lessonId') lessonId: string,
    @Req() req: any,
  ) {
    const { role } = req.user;
    if (role === 'user') {
      throw new ForbiddenException(
        'Only admin and employee users can view all student marks',
      );
    }
    return this.testsService.getLessonSubmissions(+lessonId);
  }

  @Get('test/:testId/submissions')
  async getTestSubmissions(@Param('testId') testId: string, @Req() req: any) {
    const { role } = req.user;
    if (role === 'user') {
      throw new ForbiddenException(
        'Only admin and employee users can view all student marks',
      );
    }
    return this.testsService.getTestSubmissions(+testId);
  }

  @Get('submissions/:id')
  async getSubmissionById(@Param('id') id: string, @Req() req: any) {
    const { role } = req.user;
    if (role === 'user') {
      throw new ForbiddenException(
        'Only admin and employee users can view full student submission details',
      );
    }
    return this.testsService.getSubmissionById(+id);
  }

  @Put('submissions/:id/marks')
  async updateSubmissionMarks(
    @Param('id') id: string,
    @Body() dto: UpdateMarksDto,
    @Req() req: any,
  ) {
    const { userId } = req.user;
    return this.testsService.updateSubmissionMarks(+id, dto, userId);
  }

  @Put(':testId')
  async updateTest(
    @Param('testId') testId: string,
    @Body() body: UpdateTestDto,
    @Req() req: any,
  ) {
    const { role, userId } = req.user;
    return this.testsService.updateTest(+testId, body, role, userId);
  }

  @Delete(':testId')
  async deleteTest(@Param('testId') testId: string, @Req() req: any) {
    const { role, userId } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException('Only Admin or Employee can delete tests.');
    }
    return this.testsService.deleteTest(+testId, userId);
  }

  @Post('standalone/:examId/finalize')
  async finalizeExam(@Param('examId') examId: string, @Req() req: any) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee can finalize exams',
      );
    }
    return this.examSchedulerService.finalizeExamManually(+examId);
  }
}
