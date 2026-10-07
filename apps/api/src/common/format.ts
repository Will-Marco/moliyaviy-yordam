import type { Prisma } from '../generated/prisma/client.js';
import type { IsoDate } from './dates.js';

const NBSP = ' ';
const MINUS = '−';

/** Decimal → "10 000 000,00" / "−5 000,00" for messages shown to accountants. */
export function formatMoney(value: Prisma.Decimal): string {
  const [whole, fraction] = value.abs().toFixed(2).split('.');
  return `${value.isNegative() ? MINUS : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)},${fraction}`;
}

/** "2026-01-25" → "25.01.2026" */
export const formatDate = (date: IsoDate) => date.split('-').reverse().join('.');
