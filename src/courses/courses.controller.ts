import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { CoursesService } from './courses.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        // Accept videos, pdfs, ppts, docx
        if (
          file.mimetype.match(
            /\/(pdf|mp4|mpeg|quicktime|msword|vnd.ms-powerpoint|vnd.openxmlformats-officedocument.presentationml.presentation|vnd.openxmlformats-officedocument.wordprocessingml.document)$/,
          ) ||
          file.originalname.match(/\.(pdf|mp4|mov|avi|ppt|pptx|doc|docx)$/i)
        ) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Unsupported file type. Only Video, PDF, PPT, and DOCX files are allowed.',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadFile(@UploadedFile() file: any, @Req() req: any) {
    const { role } = req.user;
    if (role === 'user') {
      throw new ForbiddenException(
        'Only admin and employee users can upload course files.',
      );
    }
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return {
      url: `/uploads/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
    };
  }

  @Post('upload-thumbnail')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/thumbnails',
        filename: (req, file, cb) => {
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
              'Unsupported file type. Only JPG, PNG, GIF, and WEBP images are allowed.',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadThumbnail(@UploadedFile() file: any, @Req() req: any) {
    const { role } = req.user;
    if (role === 'user') {
      throw new ForbiddenException(
        'Only admin and employee users can upload thumbnails.',
      );
    }
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    return {
      url: `/uploads/thumbnails/${file.filename}`,
    };
  }

  // --- Statistics & Analytics ---
  @Get('stats/dashboard')
  @UseGuards(JwtAuthGuard)
  async getDashboardStats(@Req() req: any) {
    const { userId, role } = req.user;
    if (role === 'user')
      throw new ForbiddenException(
        'Only admins and employees can view global stats',
      );
    return this.coursesService.getDashboardStats();
  }

  @Get('stats/monthly-progress')
  @UseGuards(JwtAuthGuard)
  async getMonthlyProgress(@Req() req: any) {
    const { userId, role } = req.user;
    if (role === 'user')
      throw new ForbiddenException(
        'Only admins and employees can view global stats',
      );
    return this.coursesService.getMonthlyProgress();
  }

  @Get('stats/course-progress-comparison')
  @UseGuards(JwtAuthGuard)
  async getCourseProgressComparison(@Req() req: any) {
    const { userId, role } = req.user;
    if (role === 'user')
      throw new ForbiddenException(
        'Only admins and employees can view global stats',
      );
    return this.coursesService.getCourseProgressComparison();
  }

  @Get('stats/performance')
  @UseGuards(JwtAuthGuard)
  async getCoursePerformance(@Req() req: any) {
    const { userId, role } = req.user;
    if (role === 'user')
      throw new ForbiddenException(
        'Only admins and employees can view global stats',
      );
    return this.coursesService.getCoursePerformance();
  }

  @Get('stats/user-performance')
  @UseGuards(JwtAuthGuard)
  async getUserPerformance(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { userId, role } = req.user;
    if (role === 'user')
      throw new ForbiddenException(
        'Only admins and employees can view global stats',
      );
    return this.coursesService.getUserPerformance(page, limit);
  }

  @Get('stats/categories')
  @UseGuards(JwtAuthGuard)
  async getCategoryStats(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { userId, role } = req.user;
    if (role === 'user')
      throw new ForbiddenException(
        'Only admins and employees can view global stats',
      );
    return this.coursesService.getCategoryStats(page, limit);
  }

  @Get('stats/materials')
  @UseGuards(JwtAuthGuard)
  async getMaterialStats(@Req() req: any) {
    const { userId, role } = req.user;
    if (role === 'user')
      throw new ForbiddenException(
        'Only admins and employees can view global stats',
      );
    return this.coursesService.getMaterialStats();
  }

  @Get('stats/at-risk')
  @UseGuards(JwtAuthGuard)
  async getAtRiskLearners(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { userId, role } = req.user;
    if (role === 'user')
      throw new ForbiddenException(
        'Only admins and employees can view global stats',
      );
    return this.coursesService.getAtRiskLearners(page, limit);
  }

  @Get('stats/recent-activity')
  @UseGuards(JwtAuthGuard)
  async getRecentActivity(@Req() req: any) {
    const { userId, role } = req.user;
    if (role === 'user')
      throw new ForbiddenException(
        'Only admins and employees can view global stats',
      );
    return this.coursesService.getRecentActivity();
  }

  // --- Search ---
  @Get('search/unified')
  @UseGuards(JwtAuthGuard)
  async searchUnified(@Req() req: any, @Query('q') q: string) {
    const { userId, role } = req.user;
    return this.coursesService.searchUnified(q || '');
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  async searchCoursesOnly(@Req() req: any, @Query('q') q: string) {
    const { userId, role } = req.user;
    return this.coursesService.searchCoursesOnly(q || '');
  }

  // --- Categories ---
  @Get('categories')
  @UseGuards(JwtAuthGuard)
  async getCategories(@Req() req: any) {
    const { userId, role } = req.user;
    return this.coursesService.getAllCategories();
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createCategory(
    @Body() createCategoryDto: CreateCategoryDto,
    @Req() req: any,
  ) {
    return this.coursesService.createCategory(
      createCategoryDto,
      req.user.userId,
    );
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard)
  async deleteCategory(@Param('id') id: string, @Req() req: any) {
    const { role, userId } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admins and employees can delete categories',
      );
    }
    return this.coursesService.deleteCategory(+id, userId);
  }

  // --- Courses ---
  @Get()
  @UseGuards(JwtAuthGuard)
  async getCourses(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 6,
    @Query('categoryId') categoryId?: number,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const { userId, role } = req.user;
    return this.coursesService.getCoursesPaginated(
      Number(page),
      Number(limit),
      categoryId ? Number(categoryId) : undefined,
      status,
      q,
    );
  }

  @Get('trash')
  @UseGuards(JwtAuthGuard)
  async getTrash(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('type') type?: 'course' | 'lesson',
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.coursesService.getTrashItems(
      req.user.userId,
      q,
      type,
      sortOrder || 'DESC',
    );
  }

  @Delete('trash/empty')
  @UseGuards(JwtAuthGuard)
  async emptyRecycleBin(@Req() req: any) {
    return this.coursesService.emptyRecycleBin(req.user.userId);
  }

  @Get('my-learning')
  @UseGuards(JwtAuthGuard)
  async getMyLearning(
    @Req() req: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 6,
    @Query('status') status: string = 'all',
  ) {
    const { userId } = req.user;
    return this.coursesService.getMyLearningPaginated(
      userId,
      Number(page),
      Number(limit),
      status,
    );
  }

  @Get('user-learning/:userId')
  @UseGuards(JwtAuthGuard)
  async getUserLearning(
    @Req() req: any,
    @Param('userId') targetUserId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 100,
    @Query('status') status: string = 'all',
  ) {
    const { role } = req.user;
    if (role !== 'admin' && role !== 'employee') {
      throw new ForbiddenException(
        'Only admin and employee users can view other users learning progress.',
      );
    }
    return this.coursesService.getMyLearningPaginated(
      targetUserId,
      Number(page),
      Number(limit),
      status,
    );
  }

  @Get(':courseId')
  @UseGuards(JwtAuthGuard)
  async getCourse(@Req() req: any, @Param('courseId') courseId: string) {
    const { userId, role } = req.user;
    return this.coursesService.getCourseById(courseId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createCourse(
    @Body() createCourseDto: CreateCourseDto,
    @Req() req: any,
  ) {
    return this.coursesService.createCourse(createCourseDto, req.user.userId);
  }

  @Patch(':courseId')
  @UseGuards(JwtAuthGuard)
  async updateCourse(
    @Param('courseId') courseId: string,
    @Body() updateCourseDto: UpdateCourseDto,
    @Req() req: any,
  ) {
    return this.coursesService.updateCourse(
      courseId,
      updateCourseDto,
      req.user.userId,
    );
  }

  @Patch(':courseId/status')
  @UseGuards(JwtAuthGuard)
  async updateCourseStatus(
    @Param('courseId') courseId: string,
    @Body('status') status: string,
    @Req() req: any,
  ) {
    return this.coursesService.updateCourseStatus(
      courseId,
      status,
      req.user.userId,
    );
  }

  @Patch(':courseId/restore')
  @UseGuards(JwtAuthGuard)
  async restoreCourse(@Param('courseId') courseId: string, @Req() req: any) {
    return this.coursesService.restoreCourse(courseId, req.user.userId);
  }

  @Delete(':courseId')
  @UseGuards(JwtAuthGuard)
  async deleteCourse(@Param('courseId') courseId: string, @Req() req: any) {
    return this.coursesService.deleteCourse(courseId, req.user.userId);
  }

  @Delete(':courseId/permanent')
  @UseGuards(JwtAuthGuard)
  async hardDeleteCourse(@Param('courseId') courseId: string, @Req() req: any) {
    return this.coursesService.hardDeleteCourse(courseId, req.user.userId);
  }

  // --- Lessons ---
  @Get(':courseId/lessons/:lessonId')
  @UseGuards(JwtAuthGuard)
  async getLesson(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.coursesService.getLessonById(courseId, lessonId);
  }

  @Get(':courseId/lessons')
  @UseGuards(JwtAuthGuard)
  async getLessons(@Req() req: any, @Param('courseId') courseId: string) {
    const { userId, role } = req.user;
    return this.coursesService.getLessonsByCourseId(courseId);
  }

  @Post(':courseId/lessons')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async addLesson(
    @Param('courseId') courseId: string,
    @Body() createLessonDto: CreateLessonDto,
    @Req() req: any,
  ) {
    return this.coursesService.addLessonToCourse(
      courseId,
      createLessonDto,
      req.user.userId,
    );
  }

  @Patch(':courseId/lessons/:lessonId')
  @UseGuards(JwtAuthGuard)
  async updateLesson(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Body() updateLessonDto: UpdateLessonDto,
    @Req() req: any,
  ) {
    return this.coursesService.updateLesson(
      courseId,
      lessonId,
      updateLessonDto,
      req.user.userId,
    );
  }

  @Patch(':courseId/lessons/:lessonId/restore')
  @UseGuards(JwtAuthGuard)
  async restoreLesson(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: any,
  ) {
    return this.coursesService.restoreLesson(
      courseId,
      lessonId,
      req.user.userId,
    );
  }

  @Delete(':courseId/lessons/:lessonId')
  @UseGuards(JwtAuthGuard)
  async deleteLesson(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: any,
  ) {
    return this.coursesService.deleteLesson(
      courseId,
      lessonId,
      req.user.userId,
    );
  }

  @Delete(':courseId/lessons/:lessonId/permanent')
  @UseGuards(JwtAuthGuard)
  async hardDeleteLesson(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: any,
  ) {
    return this.coursesService.hardDeleteLesson(
      courseId,
      lessonId,
      req.user.userId,
    );
  }

  // --- Enrollment & Progress ---
  @Post(':courseId/enroll')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async enrollUser(@Param('courseId') courseId: string, @Req() req: any) {
    return this.coursesService.enrollUser(courseId, req.user.userId);
  }

  @Post(':courseId/lessons/:lessonId/complete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async completeLesson(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @Req() req: any,
  ) {
    return this.coursesService.completeLesson(
      courseId,
      lessonId,
      req.user.userId,
    );
  }

  @Get(':courseId/progress/:userId')
  @UseGuards(JwtAuthGuard)
  async getProgress(
    @Req() req: any,
    @Param('courseId') courseId: string,
    @Param('userId') targetUserId: string,
  ) {
    const { userId, role } = req.user;
    return this.coursesService.getUserProgress(courseId, targetUserId);
  }
}
