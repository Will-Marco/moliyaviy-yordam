import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { OptionalNonNull, Trim } from '../../common/validation.js';

const digits = (n: number, label: string) =>
  Matches(new RegExp(`^\\d{${n}}$`), { message: `${label} ${n} ta raqamdan iborat bo'lishi kerak` });

export class CreateCompanyDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Nomi kiritilmagan' })
  @MaxLength(300)
  name: string;

  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Manzil kiritilmagan' })
  @MaxLength(500)
  address?: string | null;

  @Trim()
  @IsString()
  @digits(9, 'STIR')
  tin: string;

  @Trim()
  @IsOptional()
  @IsString()
  @digits(12, 'QQS registratsiya kodi')
  vatRegCode?: string | null;

  @Trim()
  @IsOptional()
  @IsString()
  @digits(20, 'Hisob raqami')
  bankAccount?: string | null;

  @Trim()
  @IsOptional()
  @IsString()
  @digits(5, 'MFO')
  mfo?: string | null;
}

/** PATCH: every field optional; name and STIR may not be set to null, the requisites may (FR-1.2). */
export class UpdateCompanyDto {
  @Trim()
  @OptionalNonNull()
  @IsString()
  @IsNotEmpty({ message: 'Nomi kiritilmagan' })
  @MaxLength(300)
  name?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Manzil kiritilmagan' })
  @MaxLength(500)
  address?: string | null;

  @Trim()
  @OptionalNonNull()
  @IsString()
  @digits(9, 'STIR')
  tin?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @digits(12, 'QQS registratsiya kodi')
  vatRegCode?: string | null;

  @Trim()
  @IsOptional()
  @IsString()
  @digits(20, 'Hisob raqami')
  bankAccount?: string | null;

  @Trim()
  @IsOptional()
  @IsString()
  @digits(5, 'MFO')
  mfo?: string | null;
}
