import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuestionDto {
  @IsString()
  questionText: string;

  @IsEnum(['MCQ', 'CQ', 'Video'])
  type: string;

  @IsArray()
  @IsOptional()
  options?: string[];

  @IsArray()
  @IsOptional()
  correctAnswers?: string[];

  @IsNumber()
  marks: number;

  @IsNumber()
  @IsOptional()
  postureMarks?: number;

  @IsNumber()
  @IsOptional()
  voiceMarks?: number;

  @IsNumber()
  @IsOptional()
  accuracyMarks?: number;

  @IsString()
  @IsOptional()
  evaluationType?: string;

  @IsString()
  @IsOptional()
  referenceScript?: string;
}

export class CreateTestDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['Lesson', 'Course', 'Standalone'])
  testType: string;

  @IsString()
  @IsOptional()
  referenceScript?: string;

  @IsNumber()
  @IsOptional()
  courseId?: number;

  @IsNumber()
  @IsOptional()
  lessonId?: number;

  @IsDateString()
  @IsOptional()
  startTime?: string;

  @IsDateString()
  @IsOptional()
  endTime?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions: QuestionDto[];
}
