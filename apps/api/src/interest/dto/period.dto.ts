import { ArrayMaxSize, IsArray, IsUUID, Matches } from 'class-validator';
import { MONTH } from '../../invoices/dto/invoice.dto.js';

const IsMonth = () => Matches(MONTH, { message: "Oy noto'g'ri" });

/** FR-12.1: whole months, "yyyy-mm", inclusive. */
export class PeriodQuery {
  @IsMonth()
  from: string;

  @IsMonth()
  to: string;
}

/** FR-12.3: the contracts on screen (after search/filters), in screen order. */
export class PeriodExportDto extends PeriodQuery {
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true, message: "Noto'g'ri ID" })
  contractIds: string[];
}
