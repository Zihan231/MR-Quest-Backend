import { IsString, IsNotEmpty } from 'class-validator';

export class ApplyCertificateDto {
  @IsString()
  @IsNotEmpty()
  courseId: string;
}
