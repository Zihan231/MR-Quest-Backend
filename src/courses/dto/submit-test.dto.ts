import {
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmissionAnswerDto {
  @IsNumber()
  questionId: number;

  @IsOptional()
  providedAnswer?: any; // MCQ = string[], CQ = string
}

export class SubmitTestDto {
  @IsNumber()
  testId: number;

  @IsBoolean()
  @IsOptional()
  isDraft?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmissionAnswerDto)
  answers: SubmissionAnswerDto[];
}
