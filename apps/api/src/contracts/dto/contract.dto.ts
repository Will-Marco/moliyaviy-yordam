import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsIsoDate } from '../../common/dates.js';
import { IsMoney, IsPositiveMoney, IsRateInRange, IsRatePercent } from '../../common/decimal.js';
import { OptionalNonNull, Trim } from '../../common/validation.js';

const companyId = () => IsUUID('all', { message: 'Firma tanlanmagan' });

export class CreateContractDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Shartnoma raqami kiritilmagan' })
  @MaxLength(50)
  number: string;

  @IsIsoDate()
  signedOn: string;

  @companyId()
  lenderId: string;

  @companyId()
  borrowerId: string;

  @IsMoney()
  @IsPositiveMoney()
  limitAmount: string;

  @IsIsoDate()
  startDate: string;

  @IsIsoDate()
  endDate: string;

  @IsRatePercent()
  @IsRateInRange()
  ratePercent: string;
}

/** FR-2.5: everything but the rate (rates change only through history, Module 5). */
export class UpdateContractDto {
  @Trim()
  @OptionalNonNull()
  @IsString()
  @IsNotEmpty({ message: 'Shartnoma raqami kiritilmagan' })
  @MaxLength(50)
  number?: string;

  @OptionalNonNull()
  @IsIsoDate()
  signedOn?: string;

  @OptionalNonNull()
  @companyId()
  lenderId?: string;

  @OptionalNonNull()
  @companyId()
  borrowerId?: string;

  @OptionalNonNull()
  @IsMoney()
  @IsPositiveMoney()
  limitAmount?: string;

  @OptionalNonNull()
  @IsIsoDate()
  startDate?: string;

  @OptionalNonNull()
  @IsIsoDate()
  endDate?: string;
}
