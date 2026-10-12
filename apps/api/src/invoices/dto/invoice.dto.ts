import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateBy, ValidateIf } from 'class-validator';
import { IsMoney } from '../../common/decimal.js';
import { Trim } from '../../common/validation.js';

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class InvoiceListQuery {
  @IsOptional()
  @Matches(MONTH, { message: "Oy noto'g'ri" })
  month?: string;
}

export const DRAFT_SOURCES = ['manual', 'didox'] as const;
/** Didox document ID as it appears in `/documents/{id}/1` links: 32 hex characters (a UUIDv1 without dashes). */
export const DIDOX_DOCUMENT_ID = /^[0-9A-F]{32}$/i;
export type DraftSource = (typeof DRAFT_SOURCES)[number];

/** FR-7.4: mark an invoice as drafted in Didox — by hand, or by the desktop app after saving it (FR-8.4). */
export class MarkDraftDto {
  // Free text when marked by hand; required and exact when the app read it from Didox.
  @ValidateIf((dto: MarkDraftDto, value) => value != null || dto.source === 'didox')
  @Trim()
  @IsString({ message: 'Didox ID kiritilmagan' })
  @MaxLength(100, { message: 'Didox ID 100 belgidan oshmasin' })
  @DidoxIdFromApp()
  didoxDocumentId?: string;

  @IsOptional()
  @IsIn(DRAFT_SOURCES, { message: "Manba noto'g'ri" })
  source?: DraftSource;

  /** The amount the caller put into Didox; the mark is refused if the month's interest is no longer that (FR-8.4). */
  @IsOptional()
  @IsMoney()
  expectedAmount?: string;

  @IsOptional()
  @IsBoolean()
  confirmWarnings?: boolean;
}

function DidoxIdFromApp() {
  return ValidateBy({
    name: 'didoxIdFromApp',
    validator: {
      validate: (value, args) =>
        (args?.object as MarkDraftDto | undefined)?.source !== 'didox' || (typeof value === 'string' && DIDOX_DOCUMENT_ID.test(value)),
      defaultMessage: () => "Didox ID 32 belgili hujjat identifikatori bo'lishi kerak",
    },
  });
}
