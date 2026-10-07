import { IsBoolean, IsOptional } from 'class-validator';
import { IsIsoDate } from '../../common/dates.js';
import { IsRateInRange, IsRatePercent } from '../../common/decimal.js';

export class CreateRateDto {
  @IsRatePercent()
  @IsRateInRange()
  ratePercent: string;

  /** The day the rate was changed; the effective date follows from it (CR-5). */
  @IsIsoDate()
  changedOn: string;

  @IsOptional()
  @IsBoolean()
  confirmWarnings?: boolean;
}

/** FR-5.4: only the initial rate's value can be corrected. */
export class UpdateRateDto {
  @IsRatePercent()
  @IsRateInRange()
  ratePercent: string;

  @IsOptional()
  @IsBoolean()
  confirmWarnings?: boolean;
}
