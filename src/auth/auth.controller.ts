import {
  Controller,
  Post,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import type { Response } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.authService.login(loginDto);
    response.cookie('jwt', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 3600 * 1000, // 1 hour
    });
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Res({ passthrough: true }) response: Response,
    @Req() req: any,
  ) {
    response.clearCookie('jwt');
    const token = req.cookies?.['jwt'];
    if (token) {
      this.authService.logLogout(token).catch(() => {});
    }
    return { message: 'Logged out successfully' };
  }

  @Patch('reset-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Req() req: any,
  ) {
    return this.authService.resetPassword(
      req.user.userId,
      resetPasswordDto.currentPassword,
      resetPasswordDto.newPassword,
    );
  }

  // Get current logged-in user profile
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getOwnProfile(@Req() req: any) {
    return this.authService.getUserProfile(req.user.userId);
  }

  @Get('token')
  @UseGuards(JwtAuthGuard)
  async getSocketToken(@Req() req: any) {
    const token =
      req.cookies?.['jwt'] || req.headers.authorization?.split(' ')[1];
    return { token };
  }

  @Get('users')
  @UseGuards(JwtAuthGuard)
  async getUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.authService.getUsersPaginated(Number(page), Number(limit));
  }

  @Get('users/search')
  @UseGuards(JwtAuthGuard)
  async searchUsers(@Query('q') q: string) {
    return this.authService.searchUsers(q || '');
  }

  @Post('users/employee')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createEmployee(
    @Body() createEmployeeDto: CreateEmployeeDto,
    @Req() req: any,
  ) {
    return this.authService.createEmployee(createEmployeeDto, req.user.userId);
  }

  @Get('profile/:userId')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Param('userId') userId: string) {
    return this.authService.getUserProfile(userId);
  }

  @Patch('users/:userId')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Param('userId') userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: any,
  ) {
    return this.authService.updateUserDetails(
      userId,
      updateUserDto,
      req.user.userId,
    );
  }

  @Patch('users/:userId/role')
  @UseGuards(JwtAuthGuard)
  async updateRole(
    @Param('userId') userId: string,
    @Body('role') role: string,
    @Req() req: any,
  ) {
    // The admin's userId is securely extracted from their JWT token
    return this.authService.updateUserRole(userId, role, req.user.userId);
  }

  @Post('upload-dp')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/users_dp',
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
  async uploadProfilePicture(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    return {
      url: `/uploads/users_dp/${file.filename}`,
    };
  }
}
