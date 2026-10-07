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
  @IsString()
  @IsNotEmpty({ message: 'Manzil kiritilmagan' })
  @MaxLength(500)
  address: string;

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
  @IsString()
  @digits(20, 'Hisob raqami')
  bankAccount: string;

  @Trim()
  @IsString()
  @digits(5, 'MFO')
  mfo: string;
}

/** PATCH: every field optional; required columns may not be set to null. */
export class UpdateCompanyDto {
  @Trim()
  @OptionalNonNull()
  @IsString()
  @IsNotEmpty({ message: 'Nomi kiritilmagan' })
  @MaxLength(300)
  name?: string;

  @Trim()
  @OptionalNonNull()
  @IsString()
  @IsNotEmpty({ message: 'Manzil kiritilmagan' })
  @MaxLength(500)
  address?: string;

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
  @OptionalNonNull()
  @IsString()
  @digits(20, 'Hisob raqami')
  bankAccount?: string;

  @Trim()
  @OptionalNonNull()
  @IsString()
  @digits(5, 'MFO')
  mfo?: string;
}
