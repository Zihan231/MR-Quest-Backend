import {
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsString,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

class ExamGroupEvaluationItemDto {
  @IsNumber()
  @IsNotEmpty()
  answerId: number;

  @IsNotEmpty()
  @IsNumberString()
  marksAwarded: string;

  @IsString()
  @IsOptional()
  evaluatorComment?: string;
}

export class EvaluateExamGroupDto {
  @IsNumber()
  @IsNotEmpty()
  submissionId: number;

  @ValidateNested({ each: true })
  @Type(() => ExamGroupEvaluationItemDto)
  evaluations: ExamGroupEvaluationItemDto[];
}