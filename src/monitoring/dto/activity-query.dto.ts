import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ActivityQueryDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  days: number = 30;
}
