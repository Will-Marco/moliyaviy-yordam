import { BadRequestException, Injectable } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { fromDbDate, lastDayOfMonth } from '../common/dates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { computeInterest } from './engine.js';
import { periodSummary } from './period.js';
import { engineInput, money } from './report.js';

const party = { select: { name: true, tin: true } } as const;

export interface PeriodRow {
  contractId: string;
  disbursed: string;
  repaid: string;
  interest: string;
  interestPaid: string;
  closingBalance: string;
  interestDebt: string;
}

export interface PeriodRowWithContract extends PeriodRow {
  contract: { number: string; signedOn: string; lender: { name: string; tin: string }; borrower: { name: string; tin: string } };
}

/** Module 12: every contract over a period of whole months, from the interest core (CONSTITUTION §11). */
@Injectable()
export class PeriodReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** FR-12.2 — figures only; the screen joins them with the contract list it already has. */
  async rows(from: string, to: string, contractIds?: string[]): Promise<{ from: string; to: string; asOf: string; rows: PeriodRow[] }> {
    const asOf = this.assertPeriod(from, to);
    const contracts = await this.prisma.contract.findMany({
      where: contractIds && { id: { in: contractIds } },
      select: {
        id: true,
        startDate: true,
        rateChanges: { orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }] },
        operations: { select: { date: true, type: true, amount: true } },
      },
      orderBy: [{ signedOn: 'desc' }, { number: 'asc' }],
    });
    // A month's figures depend only on days up to its end, so the core stops at the period's end.
    const end = lastDayOfMonth(to) < asOf ? lastDayOfMonth(to) : asOf;
    const rows = contracts.flatMap((c): PeriodRow[] => {
      const summary = periodSummary(computeInterest(engineInput(c, end)).months, from, to);
      if (!summary) return [];
      return [
        {
          contractId: c.id,
          disbursed: money(summary.disbursed),
          repaid: money(summary.repaid),
          interest: money(summary.interest),
          interestPaid: money(summary.interestPaid),
          closingBalance: money(summary.closingBalance),
          interestDebt: money(summary.interestDebt),
        },
      ];
    });
    return { from, to, asOf, rows };
  }

  /** FR-12.3 — the chosen contracts, in the given (screen) order, with what the sheet prints about them. */
  async rowsWithContracts(from: string, to: string, contractIds: string[]) {
    const report = await this.rows(from, to, contractIds);
    const contracts = await this.prisma.contract.findMany({
      where: { id: { in: report.rows.map((r) => r.contractId) } },
      select: { id: true, number: true, signedOn: true, lender: party, borrower: party },
    });
    const byId = new Map(contracts.map((c) => [c.id, c]));
    const order = new Map(contractIds.map((id, i) => [id, i]));
    const rows: PeriodRowWithContract[] = report.rows
      .map((row) => {
        const c = byId.get(row.contractId)!;
        return { ...row, contract: { number: c.number, signedOn: fromDbDate(c.signedOn), lender: c.lender, borrower: c.borrower } };
      })
      .sort((a, b) => order.get(a.contractId)! - order.get(b.contractId)!);
    return { ...report, rows };
  }

  /** FR-12.1: from ≤ to ≤ the current month. Returns today. */
  private assertPeriod(from: string, to: string): string {
    const today = this.clock.today();
    if (from > to) throw new BadRequestException("Davr boshi oxiridan keyin bo'lishi mumkin emas");
    if (to > today.slice(0, 7)) throw new BadRequestException("Davr joriy oydan keyin bo'lishi mumkin emas");
    return today;
  }
}
