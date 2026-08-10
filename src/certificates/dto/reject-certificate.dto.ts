import { IsString, IsNotEmpty } from 'class-validator';

export class RejectCertificateDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
