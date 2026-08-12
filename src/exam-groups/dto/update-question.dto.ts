import { IsString, IsArray, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateQuestionDto {
  @IsString()
  @IsOptional()
  questionText?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  correctAnswers?: string[];

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  marks?: number;

  @IsString()
  @IsOptional()
  type?: string;

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