import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @IsNotEmpty({ message: 'Lesson title is required' })
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Video', 'PDF', 'PPT', 'DOCX'], {
    message: 'Material Type must be Video, PDF, PPT, or DOCX',
  })
  materialType: string;

  @IsString()
  @IsNotEmpty({ message: 'Material Link is required' })
  materialLink: string;

  @IsString()
  @IsOptional()
  @IsIn(['Active', 'Draft'], { message: 'Status must be Active or Draft' })
  status?: string;

  @IsBoolean()
  @IsOptional()
  practiceEnabled?: boolean;
}
