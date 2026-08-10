import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

export class CreatePracticeTestDto {
  @IsNumber()
  lessonId: number;

  @IsNumber()
  mcqCount: number;

  @IsNumber()
  cqCount: number;

  @IsBoolean()
  @IsOptional()
  includeVideoTest?: boolean;

  @IsNumber()
  @IsOptional()
  testIndex?: number;
}
