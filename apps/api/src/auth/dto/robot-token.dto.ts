import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/validation.js';

/** The computer asking for a robot token — same rules as `createdByInstall` on Didox flags. */
export class RobotTokenDto {
  @Trim()
  @IsString({ message: "Kompyuter nomi ko'rsatilmagan" })
  @IsNotEmpty({ message: "Kompyuter nomi ko'rsatilmagan" })
  @MaxLength(100, { message: 'Kompyuter nomi 100 belgidan oshmasin' })
  install!: string;
}
