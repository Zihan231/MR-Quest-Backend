import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class CreateAiTestDto {
  @IsNumber()
  lessonId: number;

  @IsNumber()
  mcqCount: number;

  @IsNumber()
  cqCount: number;

  @IsBoolean()
  @IsOptional()
  includeVideoTest?: boolean;

  @IsString()
  sourceDocumentUrl: string;

  @IsString()
  @IsOptional()
  sourceDocumentType?: string;

  @IsString()
  @IsOptional()
  title?: string;
}
