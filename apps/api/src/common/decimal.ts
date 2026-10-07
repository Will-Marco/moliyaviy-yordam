import { ValidateBy } from 'class-validator';
import { Prisma } from '../generated/prisma/client.js';

// Money and rates travel as strings and are compared with Decimal — never as JS numbers (CONSTITUTION §7).
const MONEY = /^\d{1,16}(\.\d{1,2})?$/;
const RATE = /^\d{1,3}(\.\d{1,4})?$/;
const matches = (pattern: RegExp) => (value: unknown) => typeof value === 'string' && pattern.test(value);

/** Non-negative amount in so'm with up to 2 decimals (tiyin). */
export const IsMoney = () =>
  ValidateBy(
    { name: 'isMoney', validator: { validate: matches(MONEY) } },
    { message: "Summa noto'g'ri: faqat raqam, 2 xonagacha tiyin" },
  );

/** Only reports when the format is valid, so a malformed value gets one message. */
export const IsPositiveMoney = () =>
  ValidateBy(
    {
      name: 'isPositiveMoney',
      validator: { validate: (v: unknown) => !matches(MONEY)(v) || new Prisma.Decimal(v as string).gt(0) },
    },
    { message: "Summa 0 dan katta bo'lishi kerak" },
  );

/** Annual rate in percent: 0 < rate ≤ 100, up to 4 decimals. */
export const IsRatePercent = () =>
  ValidateBy(
    { name: 'isRatePercent', validator: { validate: matches(RATE) } },
    { message: "Stavka noto'g'ri: masalan 14 yoki 14,5" },
  );

export const IsRateInRange = () =>
  ValidateBy(
    {
      name: 'isRateInRange',
      validator: {
        validate: (v: unknown) => {
          if (!matches(RATE)(v)) return true;
          const rate = new Prisma.Decimal(v as string);
          return rate.gt(0) && rate.lte(100);
        },
      },
    },
    { message: "Stavka 0 dan katta va 100 dan oshmasligi kerak" },
  );

export const moneyString = (value: Prisma.Decimal) => value.toFixed(2);
export const rateString = (value: Prisma.Decimal) => value.toString();
