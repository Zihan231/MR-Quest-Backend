import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ExamGroupsService } from './exam-groups.service';
import { CreateExamGroupDto } from './dto/create-exam-group.dto';
import { UpdateExamGroupDto } from './dto/update-exam-group.dto';
import { AddQuestionsDto } from './dto/add-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { EnrollUserDto } from './dto/enroll-user.dto';
import { SubmitExamDto } from './dto/submit-exam.dto';
import { EvaluateExamGroupDto } from './dto/evaluate-exam-group.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('exam-groups')
export class ExamGroupsController {
  constructor(private readonly examGroupsService: ExamGroupsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createExamGroup(
    @Body() createDto: CreateExamGroupDto,
    @Req() req: any,
  ) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin or employee can create exam groups',
      );
    }
    return this.examGroupsService.createExamGroup(createDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getExamGroups(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('q') q?: string,
    @Query('status') status?: string,
  ) {
    const { userId, role } = req.user;
    return this.examGroupsService.getExamGroupsPaginated(
      Number(page),
      Number(limit),
      q,
      status,
      role,
      userId,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getExamGroup(@Param('id') id: string, @Req() req: any) {
    const { userId, role } = req.user;
    return this.examGroupsService.getExamGroupById(+id, role, userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateExamGroup(
    @Param('id') id: string,
    @Body() updateDto: UpdateExamGroupDto,
    @Req() req: any,
  ) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin or employee can update exam groups',
      );
    }
    return this.examGroupsService.updateExamGroup(+id, updateDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteExamGroup(@Param('id') id: string, @Req() req: any) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin or employee can delete exam groups',
      );
    }
    return this.examGroupsService.deleteExamGroup(+id);
  }

  @Post(':id/questions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async addQuestions(
    @Param('id') id: string,
    @Body() addQuestionsDto: AddQuestionsDto,
    @Req() req: any,
  ) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException('Only admin or employee can add questions');
    }
    return this.examGroupsService.addQuestions(+id, addQuestionsDto);
  }

  @Delete(':id/questions/:questionId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async removeQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Req() req: any,
  ) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin or employee can remove questions',
      );
    }
    return this.examGroupsService.removeQuestion(+id, +questionId);
  }

  @Patch(':id/questions/:questionId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
    @Req() req: any,
  ) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin or employee can update questions',
      );
    }
    return this.examGroupsService.updateQuestion(+id, +questionId, dto);
  }

  @Post(':id/enroll')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async enrollUser(
    @Param('id') id: string,
    @Body() enrollDto: EnrollUserDto,
    @Req() req: any,
  ) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException('Only admin or employee can enroll users');
    }
    return this.examGroupsService.enrollUser(+id, enrollDto.userId);
  }

  @Delete(':id/enroll/:userId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async removeEnrollment(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Req() req: any,
  ) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin or employee can remove enrollments',
      );
    }
    return this.examGroupsService.removeEnrollment(+id, userId);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async joinExam(@Param('id') id: string, @Req() req: any) {
    return this.examGroupsService.joinExam(+id, req.user.userId);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async submitExam(
    @Param('id') id: string,
    @Body() submitDto: SubmitExamDto,
    @Req() req: any,
  ) {
    return this.examGroupsService.submitExam(+id, req.user.userId, submitDto);
  }

  @Put(':id/evaluations')
  @UseGuards(JwtAuthGuard)
  async evaluateSubmission(
    @Param('id') id: string,
    @Body() evaluateDto: EvaluateExamGroupDto,
    @Req() req: any,
  ) {
    if (req.user.role !== 'admin' && req.user.role !== 'employee') {
      throw new ForbiddenException(
        'Only admins or employees can evaluate exams',
      );
    }
    return this.examGroupsService.evaluateSubmission(
      +id,
      req.user.userId,
      evaluateDto,
    );
  }

  @Get(':id/my-submissions')
  @UseGuards(JwtAuthGuard)
  async getMySubmissions(@Param('id') id: string, @Req() req: any) {
    return this.examGroupsService.getMySubmissions(+id, req.user.userId);
  }

  @Get(':id/submissions')
  @UseGuards(JwtAuthGuard)
  async getAllSubmissions(@Param('id') id: string, @Req() req: any) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can view all student submissions',
      );
    }
    return this.examGroupsService.getAllSubmissions(+id);
  }

  @Get(':id/remaining')
  @UseGuards(JwtAuthGuard)
  async getRemaining(@Param('id') id: string, @Req() req: any) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can view remaining count',
      );
    }
    return this.examGroupsService.getRemainingCount(+id);
  }

  @Post('upload-thumbnail')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/exam_thumbnail',
        filename: (req: any, file: any, cb: any) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only image files (jpg, jpeg, png, gif, webp) are allowed.',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadExamThumbnail(@UploadedFile() file: any, @Req() req: any) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can upload exam thumbnails.',
      );
    }
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    return {
      url: `/uploads/exam_thumbnail/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    };
  }
}
