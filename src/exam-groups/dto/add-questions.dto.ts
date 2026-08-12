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

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  marks: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  accuracyMarks?: number;

  @IsString()
  @IsOptional()
  evaluationType?: string;

  @IsString()
  @IsOptional()
  referenceScript?: string;

  @IsOptional()
  isMultipleAnswer?: boolean;
}

export class AddQuestionsDto {
  @IsNotEmpty({ message: 'At least one question is required' })
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions: QuestionDto[];
}
