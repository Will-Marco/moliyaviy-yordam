import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { fromDbDate, IsoDate, toDbDate } from '../common/dates.js';
import { moneyString } from '../common/decimal.js';
import { formatDate, formatMonth, formatTiyin } from '../common/format.js';
import { computeInterest, toTiyin } from '../interest/engine.js';
import { engineInput } from '../interest/report.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOperationDto, UpdateOperationDto } from './dto/operation.dto.js';
import { LedgerOperation, negativeBalanceWarnings, OperationType, operationWarnings, Warning, withBalances } from './ledger.js';

export interface OperationView {
  id: string;
  date: IsoDate;
  type: OperationType;
  amount: string;
  note: string | null;
  /** Principal balance after this operation (FR-3.4). */
  balanceAfter: string;
  /** Dated after today — not yet in any figure (CR-11). */
  scheduled: boolean;
}

type Row = LedgerOperation & { note: string | null };

/** Placeholder id for an operation that is not saved yet. */
const NEW = 'new';

type Loaded = Awaited<ReturnType<OperationsService['load']>>;

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(contractId: string): Promise<OperationView[]> {
    const { rows } = await this.load(contractId);
    const today = this.clock.today();
    return withBalances(rows).map((row) => toView(row, today));
  }

  async create(contractId: string, dto: CreateOperationDto) {
    const loaded = await this.load(contractId);
    const { rows } = loaded;
    const candidate: Row = {
      id: NEW,
      date: dto.date,
      type: dto.type,
      amount: new Prisma.Decimal(dto.amount),
      note: dto.note || null,
    };
    const warnings = this.check(loaded, [...rows, candidate], candidate, dto.confirmWarnings);
    const saved = await this.prisma.operation.create({
      data: { contractId, date: toDbDate(dto.date), type: dto.type, amount: dto.amount, note: candidate.note },
    });
    return { operation: await this.viewOf(contractId, saved.id), warnings };
  }

  async update(contractId: string, id: string, dto: UpdateOperationDto) {
    const loaded = await this.load(contractId);
    const { rows } = loaded;
    const current = rows.find((row) => row.id === id);
    if (!current) throw new NotFoundException('Operatsiya topilmadi');
    const candidate: Row = {
      ...current,
      date: dto.date ?? current.date,
      type: dto.type ?? current.type,
      amount: dto.amount ? new Prisma.Decimal(dto.amount) : current.amount,
      note: dto.note === undefined ? current.note : dto.note || null,
    };
    const after = rows.map((row) => (row.id === id ? candidate : row));
    const warnings = this.check(loaded, after, candidate, dto.confirmWarnings);
    await this.prisma.operation.update({
      where: { id },
      data: {
        date: dto.date && toDbDate(dto.date),
        type: dto.type,
        amount: dto.amount,
        note: dto.note === undefined ? undefined : candidate.note,
      },
    });
    return { operation: await this.viewOf(contractId, id), warnings };
  }

  /** FR-3.2: a deletion is checked like an edit — a negative balance or an overpaid interest payment asks first. */
  async remove(contractId: string, id: string, confirmWarnings = false): Promise<void> {
    const loaded = await this.load(contractId);
    const removed = loaded.rows.find((row) => row.id === id);
    if (!removed) throw new NotFoundException('Operatsiya topilmadi');
    const after = loaded.rows.filter((row) => row.id !== id);
    this.confirm(
      [
        ...negativeBalanceWarnings(loaded.rows, after),
        ...this.overpaidPayments(loaded, after, removed, removed),
        ...this.draftedMonthWarnings(loaded, after),
      ],
      confirmWarnings,
    );
    const { count } = await this.prisma.operation.deleteMany({ where: { id, contractId } });
    if (!count) throw new NotFoundException('Operatsiya topilmadi');
  }

  /** FR-3.3 / FR-4.5: warnings never block, but the first attempt asks the accountant to confirm them. */
  private check(loaded: Loaded, after: Row[], candidate: Row, confirmed = false): Warning[] {
    const { contract, rows: before } = loaded;
    const previous = before.find((row) => row.id === candidate.id);
    return this.confirm(
      [...operationWarnings(contract, before, after, candidate), ...this.dateAndInterestWarnings(loaded, after, candidate, previous)],
      confirmed,
    );
  }

  private confirm(warnings: Warning[], confirmed: boolean): Warning[] {
    if (warnings.length && !confirmed) {
      throw new ConflictException({ statusCode: 409, code: 'CONFIRMATION_REQUIRED', message: "Ogohlantirishlarni ko'rib chiqing", warnings });
    }
    return warnings;
  }

  private dateAndInterestWarnings(loaded: Loaded, after: Row[], candidate: Row, previous?: Row): Warning[] {
    const warnings: Warning[] = [];
    const today = this.clock.today();
    if (candidate.date > today && previous?.date !== candidate.date) {
      warnings.push({
        code: 'FUTURE_DATE',
        message: `Sana kelajakda (${formatDate(candidate.date)}) — operatsiya shu kungacha hisobga kirmaydi`,
      });
    }

    warnings.push(...this.overpaidPayments(loaded, after, candidate, previous));
    warnings.push(...this.draftedMonthWarnings(loaded, after));
    return warnings;
  }

  /**
   * M8: a month already drafted in Didox whose interest the change would alter — the draft would no longer match.
   * Compares the month's rounded interest before and after the change; the stored draft amount is shown for reference.
   */
  private draftedMonthWarnings(loaded: Loaded, after: Row[]): Warning[] {
    if (!loaded.drafts.length) return [];
    const monthly = (rows: Row[]) =>
      new Map(
        computeInterest(engineInput({ ...loaded.interestBasis, operations: rows.map(asStored) }, this.clock.today())).months.map(
          (m) => [m.month, m.interest],
        ),
      );
    const before = monthly(loaded.rows);
    const changed = monthly(after);
    return loaded.drafts
      .filter((d) => (before.get(d.month) ?? 0n) !== (changed.get(d.month) ?? 0n))
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((d) => ({
        code: 'DRAFTED_INVOICE_CHANGES' as const,
        message: `${formatMonth(d.month)} fakturasi Didox'da qoralama qilingan (${formatTiyin(toTiyin(d.amount))} so'm) — foiz ${formatTiyin(changed.get(d.month) ?? 0n)} so'm bo'ladi`,
      }));
  }

  /**
   * FR-4.5: an interest payment above the interest accrued by its date (completed months + that month so
   * far, each rounded) minus the other interest payments made by then. Checked for every payment, so a
   * change to principal that shrinks accrued interest is caught too; already-accepted cases are not repeated.
   */
  private overpaidPayments(loaded: Loaded, after: Row[], candidate: Row, previous?: Row): Warning[] {
    const before = loaded.rows;
    const excessBefore = this.paymentExcesses(loaded, before);
    const excessAfter = this.paymentExcesses(loaded, after);
    const candidateUnchanged =
      previous?.type === candidate.type && previous.date === candidate.date && previous.amount.eq(candidate.amount);

    return [...excessAfter]
      .filter(([id, { excess }]) => {
        if (id === candidate.id && candidateUnchanged) return false;
        const earlier = excessBefore.get(id);
        return !earlier || excess > earlier.excess;
      })
      .map(([id, { row, available }]) => ({
        code: 'INTEREST_OVERPAID' as const,
        message:
          id === candidate.id
            ? `Foiz to'lovi shu sanagacha hisoblangan foiz qarzidan (${formatTiyin(available)} so'm) ko'p`
            : `${formatDate(row.date)} dagi foiz to'lovi shu sanagacha hisoblangan foiz qarzidan (${formatTiyin(available)} so'm) ko'p bo'lib qoladi`,
      }));
  }

  private paymentExcesses(loaded: Loaded, rows: Row[]) {
    const result = new Map<string, { row: Row; available: bigint; excess: bigint }>();
    for (const payment of rows.filter((row) => row.type === 'INTEREST_PAYMENT')) {
      const { months } = computeInterest(
        engineInput({ ...loaded.interestBasis, operations: rows.map(asStored) }, payment.date),
      );
      const accrued = months.reduce((sum, m) => sum + m.interest, 0n);
      const otherPaid = rows
        .filter((row) => row.id !== payment.id && row.type === 'INTEREST_PAYMENT' && row.date <= payment.date)
        .reduce((sum, row) => sum + toTiyin(row.amount), 0n);
      const available = accrued - otherPaid;
      const excess = toTiyin(payment.amount) - available;
      if (excess > 0n) result.set(payment.id, { row: payment, available, excess });
    }
    return result;
  }

  private async load(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        limitAmount: true,
        startDate: true,
        endDate: true,
        rateChanges: { orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }] },
        operations: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
        invoiceDrafts: { select: { month: true, amount: true } },
      },
    });
    if (!contract) throw new NotFoundException('Shartnoma topilmadi');
    const rows: Row[] = contract.operations.map((op) => ({
      id: op.id,
      date: fromDbDate(op.date),
      type: op.type,
      amount: op.amount,
      note: op.note,
    }));
    return {
      contract: {
        limitAmount: contract.limitAmount,
        startDate: fromDbDate(contract.startDate),
        endDate: fromDbDate(contract.endDate),
      },
      interestBasis: { startDate: contract.startDate, rateChanges: contract.rateChanges },
      rows,
      drafts: contract.invoiceDrafts,
    };
  }

  private async viewOf(contractId: string, id: string): Promise<OperationView> {
    const view = (await this.list(contractId)).find((op) => op.id === id);
    if (!view) throw new NotFoundException('Operatsiya topilmadi');
    return view;
  }
}

const asStored = (row: Row) => ({ date: toDbDate(row.date), type: row.type, amount: row.amount });

function toView(row: Row & { balanceAfter: Prisma.Decimal }, today: IsoDate): OperationView {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    amount: moneyString(row.amount),
    note: row.note,
    balanceAfter: moneyString(row.balanceAfter),
    scheduled: row.date > today,
  };
}
