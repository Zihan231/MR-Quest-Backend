import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ExamGroup } from '../exam-groups/entities/exam-group.entity';
import { ExamGroupQuestion } from '../exam-groups/entities/exam-group-question.entity';
import { ExamGroupEnrollment } from '../exam-groups/entities/exam-group-enrollment.entity';
import { ExamGroupSubmission } from '../exam-groups/entities/exam-group-submission.entity';
import { ExamGroupAnswer } from '../exam-groups/entities/exam-group-answer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      ExamGroup,
      ExamGroupQuestion,
      ExamGroupEnrollment,
      ExamGroupSubmission,
      ExamGroupAnswer,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule, TypeOrmModule],
})
export class AuthModule {}
