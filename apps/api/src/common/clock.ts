import { Injectable } from '@nestjs/common';
import type { IsoDate } from './dates.js';

/** "Today" for business rules — the accountants' calendar date in Tashkent. Override in tests. */
@Injectable()
export class Clock {
  today(): IsoDate {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  }
}
