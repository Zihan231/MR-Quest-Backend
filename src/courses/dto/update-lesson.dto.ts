import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateLessonDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(['Video', 'PDF', 'PPT', 'DOCX'], {
    message: 'Material Type must be Video, PDF, PPT, or DOCX',
  })
  materialType?: string;

  @IsString()
  @IsOptional()
  materialLink?: string;

  @IsString()
  @IsOptional()
  @IsIn(['Active', 'Draft'], { message: 'Status must be Active or Draft' })
  status?: string;

  @IsBoolean()
  @IsOptional()
  practiceEnabled?: boolean;
}
