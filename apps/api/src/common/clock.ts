import { Injectable } from '@nestjs/common';
import type { IsoDate } from './dates.js';

const tashkent = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' });

/** The accountants' calendar date of a moment — business dates are Tashkent dates. */
export const tashkentDate = (at: Date): IsoDate => tashkent.format(at);

/** "Today" for business rules — the accountants' calendar date in Tashkent. Override in tests. */
@Injectable()
export class Clock {
  today(): IsoDate {
    return tashkentDate(new Date());
  }
}
