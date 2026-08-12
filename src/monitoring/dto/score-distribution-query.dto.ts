import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class ScoreDistributionQueryDto {
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  examGroupId?: number;

  @IsString()
  @IsOptional()
  division?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  upazila?: string;
}
