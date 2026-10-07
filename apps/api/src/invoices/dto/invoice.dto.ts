import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Trim } from '../../common/validation.js';

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class InvoiceListQuery {
  @IsOptional()
  @Matches(MONTH, { message: "Oy noto'g'ri" })
  month?: string;
}

/** FR-7.4: mark an invoice as drafted in Didox by hand. */
export class MarkDraftDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100, { message: 'Didox ID 100 belgidan oshmasin' })
  didoxDocumentId?: string;

  @IsOptional()
  @IsBoolean()
  confirmWarnings?: boolean;
}
