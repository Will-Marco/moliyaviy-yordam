import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsIsoDate } from '../../common/dates.js';
import { IsMoney, IsPositiveMoney } from '../../common/decimal.js';
import { OptionalNonNull, Trim } from '../../common/validation.js';
import type { OperationType } from '../ledger.js';

const TYPES: OperationType[] = ['DISBURSEMENT', 'PRINCIPAL_REPAYMENT', 'INTEREST_PAYMENT'];
const IsOperationType = () => IsIn(TYPES, { message: "Operatsiya turi noto'g'ri" });
const NOTE_MAX = () => MaxLength(500, { message: "Izoh 500 belgidan oshmasligi kerak" });

export class CreateOperationDto {
  @IsIsoDate()
  date: string;

  @IsOperationType()
  type: OperationType;

  @IsMoney()
  @IsPositiveMoney()
  amount: string;

  @Trim()
  @IsOptional()
  @IsString()
  @NOTE_MAX()
  note?: string | null;

  /** FR-3.3: true after the accountant has seen the warnings and chose "Baribir saqlash". */
  @IsOptional()
  @IsBoolean()
  confirmWarnings?: boolean;
}

export class UpdateOperationDto {
  @OptionalNonNull()
  @IsIsoDate()
  date?: string;

  @OptionalNonNull()
  @IsOperationType()
  type?: OperationType;

  @OptionalNonNull()
  @IsMoney()
  @IsPositiveMoney()
  amount?: string;

  @Trim()
  @IsOptional()
  @IsString()
  @NOTE_MAX()
  note?: string | null;

  @IsOptional()
  @IsBoolean()
  confirmWarnings?: boolean;
}
