import { IsString, IsNumber, IsOptional } from 'class-validator';

export class UpdateAiVideoTestScriptDto {
  @IsString()
  @IsOptional()
  scriptText?: string;

  @IsNumber()
  @IsOptional()
  durationSeconds?: number;

  @IsString()
  @IsOptional()
  cloudStorageUrl?: string;
}
