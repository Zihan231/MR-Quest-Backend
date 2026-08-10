import {
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

class ExamGroupEvaluationItemDto {
  @IsNumber()
  @IsNotEmpty()
  answerId: number;

  @IsNumber()
  @IsNotEmpty()
  marksAwarded: number;

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
