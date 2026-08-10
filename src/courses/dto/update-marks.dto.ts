import {
  IsNumber,
  IsString,
  IsOptional,
  ValidateNested,
  IsArray,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmissionMarkDto {
  @IsNumber()
  submissionAnswerId: number;

  @IsNumber()
  @Min(0)
  marksAwarded: number;

  @IsString()
  @IsOptional()
  evaluatorComment?: string;
}

export class UpdateMarksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmissionMarkDto)
  answers: SubmissionMarkDto[];
}
