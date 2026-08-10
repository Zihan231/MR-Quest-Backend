import { IsString, IsArray, IsNumber, IsOptional } from 'class-validator';

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
  @IsOptional()
  marks?: number;

  @IsString()
  @IsOptional()
  type?: string;

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
