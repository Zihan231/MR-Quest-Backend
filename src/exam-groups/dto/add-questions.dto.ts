import {
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
  IsOptional,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

class QuestionDto {
  @IsString()
  @IsNotEmpty()
  questionText: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsArray()
  @IsString({ each: true })
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
}

export class AddQuestionsDto {
  @IsNotEmpty({ message: 'At least one question is required' })
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions: QuestionDto[];
}
