import ExcelJS from 'exceljs';
import type { IsoDate } from '../common/dates.js';
import { formatDate, formatMonth } from '../common/format.js';
import type { ContractView } from '../contracts/contract.view.js';
import type { OperationView } from '../operations/operations.service.js';
import type { reportView } from './report.js';

type Report = ReturnType<typeof reportView>;

const MONEY_FORMAT = '#,##0.00;-#,##0.00';
const EXACT_FORMAT = '#,##0.000000;-#,##0.000000';
const DATE_FORMAT = 'dd.mm.yyyy';

/**
 * FR-6.3: amounts as Excel numbers so accountants can sum them. Excel keeps 15 significant digits;
 * anything longer stays text, so no tiyin is ever lost. Input is the API's exact decimal string.
 */
export function moneyCell(value: string): number | string {
  const digits = value.replace(/^-/, '').replace('.', '').replace(/^0+(?=\d)/, '');
  return digits.length <= 15 ? Number(value) : value;
}

const excelDate = (date: IsoDate) => new Date(`${date}T00:00:00.000Z`);
const monthLabel = (m: Report['months'][number]) =>
  m.partial ? `${formatMonth(m.month)} (${formatDate(m.to).slice(0, 5)} gacha)` : formatMonth(m.month);

/** FR-6.1/6.2: built only from the report the screen shows (CONSTITUTION §11). */
export async function buildReportWorkbook(contract: ContractView, report: Report, operations: OperationView[]) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Moliyaviy yordam';
  monthlySheet(book.addWorksheet('Oylik hisobot'), contract, report);
  segmentsSheet(book.addWorksheet("Bo'laklar"), report);
  operationsSheet(book.addWorksheet('Operatsiyalar'), operations);
  return Buffer.from(await book.xlsx.writeBuffer());
}

export function reportFileName(contract: ContractView, asOf: IsoDate): string {
  const ascii = (text: string) =>
    text
      .normalize('NFKD')
      .replace(/"|\b(MCHJ|XK|AJ|QK|OOO|LLC)\b/gi, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `Shartnoma_${ascii(contract.number)}_${ascii(contract.lender.name) || 'firma'}_${asOf}.xlsx`;
}

function monthlySheet(sheet: ExcelJS.Worksheet, contract: ContractView, report: Report) {
  const requisites: [string, string | number][] = [
    ['Shartnoma', `Shartnoma № ${contract.number}, ${formatDate(contract.signedOn)}`],
    ['Beruvchi', `${contract.lender.name} (STIR ${contract.lender.tin})`],
    ['Oluvchi', `${contract.borrower.name} (STIR ${contract.borrower.tin})`],
    ['Summa (limit)', moneyCell(contract.limitAmount)],
    ['Muddat', `${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`],
    ['Joriy stavka, %', Number(contract.currentRate.ratePercent)],
    ['Hisobot sanasi', formatDate(report.asOf)],
  ];
  sheet.addRow(['Oylik foiz hisoboti']).font = { bold: true, size: 14 };
  for (const [label, value] of requisites) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    if (typeof value === 'number' && label.startsWith('Summa')) row.getCell(2).numFmt = MONEY_FORMAT;
  }
  sheet.addRow([]);

  const header = sheet.addRow([
    'Oy',
    'Stavka, %',
    'Boshidagi qoldiq',
    'Berildi',
    'Qaytarildi',
    'Oxiridagi qoldiq',
    'Hisoblangan foiz',
    "To'langan foiz",
    'Foiz qarzi',
  ]);
  header.font = { bold: true };
  for (const m of report.months) {
    const row = sheet.addRow([
      monthLabel(m),
      m.rates.length === 1 ? Number(m.rates[0]) : m.rates.join(' → '),
      ...[m.openingBalance, m.disbursed, m.repaid, m.closingBalance, m.interest, m.interestPaid, m.interestDebt].map(moneyCell),
    ]);
    for (let col = 3; col <= 9; col++) row.getCell(col).numFmt = MONEY_FORMAT;
  }
  const total = sheet.addRow([
    'Jami',
    null,
    null,
    null,
    null,
    null,
    moneyCell(report.totals.interestAccrued),
    moneyCell(report.totals.interestPaid),
    moneyCell(report.totals.interestDebt),
  ]);
  total.font = { bold: true };
  for (let col = 7; col <= 9; col++) total.getCell(col).numFmt = MONEY_FORMAT;

  sheet.getColumn(1).width = 26;
  for (let col = 2; col <= 9; col++) sheet.getColumn(col).width = col === 2 ? 34 : 18;
}

function segmentsSheet(sheet: ExcelJS.Worksheet, report: Report) {
  sheet.addRow(['Oy', 'Boshi', 'Oxiri', 'Kun', 'Qoldiq', 'Stavka, %', 'Yil kunlari', 'Foiz (aniq)']).font = { bold: true };
  for (const m of report.months) {
    for (const s of m.segments) {
      const row = sheet.addRow([
        formatMonth(m.month),
        excelDate(s.from),
        excelDate(s.to),
        s.days,
        moneyCell(s.balance),
        Number(s.ratePercent),
        s.yearDays,
        Number(s.interestExact),
      ]);
      row.getCell(2).numFmt = DATE_FORMAT;
      row.getCell(3).numFmt = DATE_FORMAT;
      row.getCell(5).numFmt = MONEY_FORMAT;
      row.getCell(8).numFmt = EXACT_FORMAT;
    }
  }
  sheet.columns.forEach((column, i) => (column.width = [16, 12, 12, 6, 18, 10, 11, 18][i]));
}

function operationsSheet(sheet: ExcelJS.Worksheet, operations: OperationView[]) {
  sheet.addRow(['Sana', 'Berildi', 'Qaytarildi', "Foiz to'landi", 'Qoldiq', 'Izoh']).font = { bold: true };
  const amountIn = (op: OperationView, type: OperationView['type']) => (op.type === type ? moneyCell(op.amount) : null);
  for (const op of operations) {
    const row = sheet.addRow([
      excelDate(op.date),
      amountIn(op, 'DISBURSEMENT'),
      amountIn(op, 'PRINCIPAL_REPAYMENT'),
      amountIn(op, 'INTEREST_PAYMENT'),
      moneyCell(op.balanceAfter),
      op.scheduled ? [op.note, '(rejalashtirilgan)'].filter(Boolean).join(' ') : op.note,
    ]);
    row.getCell(1).numFmt = DATE_FORMAT;
    for (let col = 2; col <= 5; col++) row.getCell(col).numFmt = MONEY_FORMAT;
  }
  sheet.columns.forEach((column, i) => (column.width = [12, 18, 18, 18, 18, 40][i]));
}
