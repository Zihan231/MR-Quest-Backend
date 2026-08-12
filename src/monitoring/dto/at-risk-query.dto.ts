import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class AtRiskQueryDto {
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  threshold: number = 20;
}
