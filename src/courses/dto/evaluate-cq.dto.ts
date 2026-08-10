import {
  IsNumber,
  IsString,
  IsOptional,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EvaluationMarkDto {
  @IsNumber()
  submissionAnswerId: number;

  @IsNumber()
  marksAwarded: number;

  @IsString()
  @IsOptional()
  evaluatorComment?: string;
}

export class EvaluateCqDto {
  @IsNumber()
  testSubmissionId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationMarkDto)
  evaluations: EvaluationMarkDto[];
}
