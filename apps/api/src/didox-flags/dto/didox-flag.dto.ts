import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Trim } from '../../common/validation.js';
import { MONTH } from '../../invoices/dto/invoice.dto.js';

/** The desktop's own codes (apps/desktop/src/didox/contract.ts): SAVE_FAILED, SAVED_ID_AMBIGUOUS, … */
const FLAG_CODE = /^[A-Z][A-Z0-9_]*$/;

export class FlagListQuery {
  @Matches(MONTH, { message: "Oy noto'g'ri" })
  month!: string;
}

/** Which desktop install wrote the flag (M13 §4.2) — the page names that computer to the accountant. */
export class SkipDto {
  @Trim()
  @IsString({ message: "Kompyuter nomi ko'rsatilmagan" })
  @IsNotEmpty({ message: "Kompyuter nomi ko'rsatilmagan" })
  @MaxLength(100, { message: 'Kompyuter nomi 100 belgidan oshmasin' })
  createdByInstall!: string;
}

/**
 * Didox IDs are checked only for size: they are what the robot read off the page and are only shown back, and a
 * stricter rule here would stop the robot from recording the very problem it found.
 */
export class NeedsCheckDto extends SkipDto {
  @IsString({ message: "Kod ko'rsatilmagan" })
  @Matches(FLAG_CODE, { message: "Kod noto'g'ri" })
  @MaxLength(50, { message: 'Kod 50 belgidan oshmasin' })
  code!: string;

  @Trim()
  @IsString({ message: "Xabar ko'rsatilmagan" })
  @IsNotEmpty({ message: "Xabar ko'rsatilmagan" })
  @MaxLength(1000, { message: 'Xabar 1000 belgidan oshmasin' })
  message!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  didoxId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  candidateIds?: string[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  runId?: string;
}
