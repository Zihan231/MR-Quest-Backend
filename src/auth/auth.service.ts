import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async signToken(userId: string, role: string): Promise<string> {
    return this.jwtService.sign({ userId, role });
  }

  private async generateNextUserId(): Promise<string> {
    const lastUser = await this.userRepository.findOne({
      where: {},
      order: { id: 'DESC' },
    });
    if (!lastUser || !lastUser.userId) {
      return 'TX-0001';
    }
    const match = lastUser.userId.match(/TX-(\d+)/);
    const nextNum = match ? parseInt(match[1]) + 1 : 1;
    return `TX-${String(nextNum).padStart(4, '0')}`;
  }

  async createEmployee(
    createEmployeeDto: CreateEmployeeDto,
    requesterId: string,
  ): Promise<Omit<User, 'password'>> {
    const requester = await this.userRepository.findOne({
      where: { userId: requesterId },
    });
    if (!requester) {
      throw new NotFoundException(
        `Admin user with ID ${requesterId} not found`,
      );
    }
    if (requester.role !== 'admin') {
      throw new ForbiddenException('Only admin users can add employees');
    }

    const existingUser = await this.userRepository.findOne({
      where: { email: createEmployeeDto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const userId = await this.generateNextUserId();
    const hashedPassword = await bcrypt.hash(createEmployeeDto.password, 10);
    const newUser = this.userRepository.create({
      ...createEmployeeDto,
      userId,
      password: hashedPassword,
      role: 'employee', // Always force employee role
    });

    const savedUser = await this.userRepository.save(newUser);
    const { password, ...result } = savedUser;

    await this.activityLogsService.log({
      actorId: requesterId,
      actorName: requester.name,
      actorRole: requester.role,
      action: 'EMPLOYEE_CREATED',
      targetType: 'User',
      targetName: result.name,
      targetId: result.userId,
      details: { email: result.email, role: result.role },
    });

    return result;
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ user: Omit<User, 'password'>; token: string }> {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        userId: true,
        role: true,
        phoneNumber: true,
        address: true,
      }, // Explicitly fetch password
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = await this.signToken(user.userId, user.role);
    const { password, ...result } = user;

    return { user: result, token };
  }

  async logLogout(token: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(token);
      const userId = payload?.userId;
      if (!userId) return;
      const actor = await this.userRepository.findOne({ where: { userId } });
      await this.activityLogsService.log({
        actorId: userId,
        actorName: actor?.name || userId,
        actorRole: actor?.role || 'unknown',
        action: 'USER_LOGOUT',
        targetType: 'User',
        targetName: actor?.name || userId,
        targetId: userId,
      });
    } catch (err: any) {
      this.logger.warn(`[ActivityLog] Logout log skipped: ${err?.message}`);
    }
  }

  async resetPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { userId },
      select: {
        id: true,
        password: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await this.userRepository.save(user);

    return { message: 'Password reset successfully' };
  }

  async getUserProfile(userId: string): Promise<Omit<User, 'password'>> {
    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    const { password, ...result } = user;
    return result;
  }

  async updateUserDetails(
    userId: string,
    updateUserDto: UpdateUserDto,
    requesterId: string,
  ): Promise<Omit<User, 'password'>> {
    // Verify identity: only the user themselves or an admin can update the profile
    if (requesterId !== userId) {
      const requester = await this.userRepository.findOne({
        where: { userId: requesterId },
      });
      if (!requester || requester.role !== 'admin') {
        throw new ForbiddenException('You can only update your own profile');
      }
    }

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    // If a new profile picture is being set, delete the old one from disk
    if (
      updateUserDto.profilePictureUrl &&
      user.profilePictureUrl &&
      updateUserDto.profilePictureUrl !== user.profilePictureUrl
    ) {
      const oldPath = join(process.cwd(), user.profilePictureUrl);
      console.log(
        `[DP DELETE] Old URL: "${user.profilePictureUrl}" | Built path: "${oldPath}" | Exists: ${fs.existsSync(oldPath)}`,
      );
      try {
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
          this.logger.log(`Deleted old profile picture: ${oldPath}`);
          console.log(`[DP DELETE] SUCCESS: Deleted ${oldPath}`);
        } else {
          console.log(`[DP DELETE] File not found at: ${oldPath}`);
        }
      } catch (err) {
        this.logger.error(
          `Failed to delete old profile picture: ${oldPath}`,
          err,
        );
        console.error(`[DP DELETE] ERROR:`, err);
      }
    } else {
      console.log(
        `[DP DELETE] Skipped. newUrl="${updateUserDto.profilePictureUrl}" oldUrl="${user.profilePictureUrl}"`,
      );
    }

    Object.assign(user, updateUserDto);
    const saved = await this.userRepository.save(user);
    const { password, ...result } = saved;

    // Audit log — resolve the actual actor for accuracy (admin may edit another user)
    let actorName = result.name;
    let actorRole = result.role;
    if (requesterId !== result.userId) {
      const actor = await this.userRepository.findOne({
        where: { userId: requesterId },
      });
      if (actor) {
        actorName = actor.name;
        actorRole = actor.role;
      }
    }
    await this.activityLogsService.log({
      actorId: requesterId,
      actorName,
      actorRole,
      action: 'PROFILE_UPDATED',
      targetType: 'User',
      targetName: result.name,
      targetId: result.userId,
      details: {
        changedFields: Object.keys(updateUserDto).filter(
          (k) => (updateUserDto as any)[k] !== undefined,
        ),
      },
    });

    return result;
  }

  async updateUserRole(
    userId: string,
    role: string,
    adminUserId: string,
  ): Promise<Omit<User, 'password'>> {
    const adminUser = await this.userRepository.findOne({
      where: { userId: adminUserId },
    });
    if (!adminUser) {
      throw new NotFoundException(
        `Admin user with ID ${adminUserId} not found`,
      );
    }
    if (adminUser.role !== 'admin') {
      throw new ForbiddenException('Only admin users can modify user roles');
    }
    if (role !== 'user' && role !== 'employee' && role !== 'admin') {
      throw new BadRequestException(
        'Invalid role name. Must be user, employee, or admin',
      );
    }

    const user = await this.userRepository.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    const oldRole = user.role;
    user.role = role;
    const saved = await this.userRepository.save(user);
    const { password, ...result } = saved;

    await this.activityLogsService.log({
      actorId: adminUserId,
      actorName: adminUser.name,
      actorRole: adminUser.role,
      action: 'ROLE_CHANGED',
      targetType: 'User',
      targetName: result.name,
      targetId: result.userId,
      details: { userId: result.userId, fromRole: oldRole, toRole: role },
    });

    return result;
  }

  async searchUsers(query: string): Promise<Omit<User, 'password'>[]> {
    const users = await this.userRepository.find({
      where: [
        { name: ILike(`%${query}%`) },
        { email: ILike(`%${query}%`) },
        { role: ILike(`%${query}%`) },
        { userId: ILike(`%${query}%`) },
      ],
    });
    return users.map(
      ({ password, ...userWithoutPassword }) => userWithoutPassword,
    );
  }

  async getAllUsers(): Promise<Omit<User, 'password'>[]> {
    const users = await this.userRepository.find();
    return users.map(
      ({ password, ...userWithoutPassword }) => userWithoutPassword,
    );
  }

  async getUsersPaginated(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: Omit<User, 'password'>[]; meta: any }> {
    const skippedItems = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userRepository.find({
        skip: skippedItems,
        take: limit,
        order: {
          id: 'ASC',
        },
      }),
      this.userRepository.count(),
    ]);

    const data = users.map(
      ({ password, ...userWithoutPassword }) => userWithoutPassword,
    );
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages,
        currentPage: page,
      },
    };
  }
}
