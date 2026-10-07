import { ValidateBy, ValidationOptions } from 'class-validator';

/** Calendar date as `yyyy-mm-dd`, the only date format the API speaks. */
export type IsoDate = string;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export const IsIsoDate = (options?: ValidationOptions) =>
  ValidateBy({ name: 'isIsoDate', validator: { validate: isIsoDate } }, { message: "Sana noto'g'ri", ...options });

/** Postgres DATE ↔ JS Date at UTC midnight — never local time. */
export const toDbDate = (date: IsoDate): Date => new Date(`${date}T00:00:00.000Z`);
export const fromDbDate = (date: Date): IsoDate => date.toISOString().slice(0, 10);
