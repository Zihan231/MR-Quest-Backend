import {
  IsNumber,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AnswerDto {
  @IsNumber()
  @IsNotEmpty()
  questionId: number;

  @IsString({ each: true })
  @IsNotEmpty()
  providedAnswer: string[];
}

export class SubmitExamDto {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}
