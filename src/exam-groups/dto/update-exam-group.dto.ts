import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateExamGroupDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @IsIn(['draft', 'active', 'completed', 'cancelled'], {
    message: 'Status must be draft, active, completed, or cancelled',
  })
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsNumber()
  @IsOptional()
  timePerQuestion?: number | null;
}
