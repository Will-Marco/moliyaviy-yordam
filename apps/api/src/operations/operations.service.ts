import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { fromDbDate, IsoDate, toDbDate } from '../common/dates.js';
import { moneyString } from '../common/decimal.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOperationDto, UpdateOperationDto } from './dto/operation.dto.js';
import { LedgerOperation, OperationType, operationWarnings, Warning, withBalances } from './ledger.js';

export interface OperationView {
  id: string;
  date: IsoDate;
  type: OperationType;
  amount: string;
  note: string | null;
  /** Principal balance after this operation (FR-3.4). */
  balanceAfter: string;
}

type Row = LedgerOperation & { note: string | null };

/** Placeholder id for an operation that is not saved yet. */
const NEW = 'new';

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(contractId: string): Promise<OperationView[]> {
    const { rows } = await this.load(contractId);
    return withBalances(rows).map(toView);
  }

  async create(contractId: string, dto: CreateOperationDto) {
    const { contract, rows } = await this.load(contractId);
    const candidate: Row = {
      id: NEW,
      date: dto.date,
      type: dto.type,
      amount: new Prisma.Decimal(dto.amount),
      note: dto.note || null,
    };
    const warnings = this.check(contract, rows, [...rows, candidate], candidate, dto.confirmWarnings);
    const saved = await this.prisma.operation.create({
      data: { contractId, date: toDbDate(dto.date), type: dto.type, amount: dto.amount, note: candidate.note },
    });
    return { operation: await this.viewOf(contractId, saved.id), warnings };
  }

  async update(contractId: string, id: string, dto: UpdateOperationDto) {
    const { contract, rows } = await this.load(contractId);
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
    const warnings = this.check(contract, rows, after, candidate, dto.confirmWarnings);
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

  async remove(contractId: string, id: string): Promise<void> {
    const { count } = await this.prisma.operation.deleteMany({ where: { id, contractId } });
    if (!count) throw new NotFoundException('Operatsiya topilmadi');
  }

  /** FR-3.3: warnings never block, but the first attempt asks the accountant to confirm them. */
  private check(
    contract: { limitAmount: Prisma.Decimal; startDate: IsoDate; endDate: IsoDate },
    before: Row[],
    after: Row[],
    candidate: Row,
    confirmed = false,
  ): Warning[] {
    const warnings = operationWarnings(contract, before, after, candidate);
    if (warnings.length && !confirmed) {
      throw new ConflictException({
        statusCode: 409,
        code: 'CONFIRMATION_REQUIRED',
        message: 'Ogohlantirishlarni ko\'rib chiqing',
        warnings,
      });
    }
    return warnings;
  }

  private async load(contractId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        limitAmount: true,
        startDate: true,
        endDate: true,
        operations: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
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
      rows,
    };
  }

  private async viewOf(contractId: string, id: string): Promise<OperationView> {
    const view = (await this.list(contractId)).find((op) => op.id === id);
    if (!view) throw new NotFoundException('Operatsiya topilmadi');
    return view;
  }
}

function toView(row: Row & { balanceAfter: Prisma.Decimal }): OperationView {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    amount: moneyString(row.amount),
    note: row.note,
    balanceAfter: moneyString(row.balanceAfter),
  };
}
