import type { Prisma } from '../generated/prisma/client.js';
import type { IsoDate } from './dates.js';

const NBSP = ' ';
const MINUS = '−';

/** Decimal → "10 000 000,00" / "−5 000,00" for messages shown to accountants. */
export function formatMoney(value: Prisma.Decimal): string {
  const [whole, fraction] = value.abs().toFixed(2).split('.');
  return `${value.isNegative() ? MINUS : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)},${fraction}`;
}

/** 56958904n tiyin → "569 589,04" (for bigint results of the interest engine). */
export function formatTiyin(tiyin: bigint): string {
  const abs = (tiyin < 0n ? -tiyin : tiyin).toString().padStart(3, '0');
  const whole = abs.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${tiyin < 0n ? MINUS : ''}${whole},${abs.slice(-2)}`;
}

/** "2026-01-25" → "25.01.2026" */
export const formatDate = (date: IsoDate) => date.split('-').reverse().join('.');
