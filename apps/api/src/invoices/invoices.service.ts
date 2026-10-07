import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Clock, tashkentDate } from '../common/clock.js';
import { fromDbDate } from '../common/dates.js';
import { formatDate } from '../common/format.js';
import { Prisma } from '../generated/prisma/client.js';
import { money } from '../interest/report.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MarkDraftDto, MONTH } from './dto/invoice.dto.js';
import { completedMonths, InvoiceRow, invoiceRow, isCompletedMonth, monthInterest, StoredDraft } from './invoice.js';

const party = { select: { id: true, name: true, tin: true } } as const;

type Party = { id: string; name: string; tin: string };

const invoiceSelect = (month: string) =>
  ({
    id: true,
    number: true,
    signedOn: true,
    startDate: true,
    lender: party,
    borrower: party,
    rateChanges: { orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }] },
    operations: { select: { date: true, type: true, amount: true } },
    invoiceDrafts: { where: { month } },
  }) satisfies Prisma.ContractSelect;

type InvoiceContract = Prisma.ContractGetPayload<{ select: ReturnType<typeof invoiceSelect> }>;

export interface InvoiceView extends InvoiceRow {
  contractId: string;
  lender: Party;
  borrower: Party;
  contract: { number: string; signedOn: string };
}

/** Module 7: invoices to prepare for a completed month and their Didox draft status. */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** `lenders` — everyone who lends in any contract, so the filter (FR-7.5) does not depend on the month. */
  async list(
    requested?: string,
  ): Promise<{ month: string | null; months: string[]; lenders: Party[]; rows: InvoiceView[] }> {
    if (requested) this.assertCompleted(requested);
    const all = await this.prisma.contract.findMany({ select: { startDate: true, lender: party } });
    const months = completedMonths(all.map((c) => fromDbDate(c.startDate)), this.clock.today());
    const lenders = [...new Map(all.map((c) => [c.lender.id, c.lender])).values()].sort((a, b) => a.name.localeCompare(b.name));
    if (requested && !months.includes(requested)) throw new BadRequestException("Bu oyda amal qilgan shartnoma yo'q");
    const month = requested ?? months[0] ?? null;
    if (!month) return { month, months, lenders, rows: [] };

    const contracts = await this.prisma.contract.findMany({
      select: invoiceSelect(month),
      orderBy: [{ lender: { name: 'asc' } }, { signedOn: 'asc' }, { number: 'asc' }],
    });
    const rows = contracts.flatMap((c) => this.view(c, month) ?? []);
    return { month, months, lenders, rows };
  }

  async markDraft(month: string, contractId: string, dto: MarkDraftDto): Promise<InvoiceView> {
    this.assertMonth(month);
    this.assertCompleted(month);
    const contract = await this.find(month, contractId);
    const interest = monthInterest(contract, month, this.clock.today());
    if (interest <= 0n) throw new BadRequestException("Bu oy uchun foiz yo'q — faktura tuzilmaydi");

    const existing = contract.invoiceDrafts[0];
    if (existing && !dto.confirmWarnings) {
      const id = existing.didoxDocumentId ? `, Didox ID: ${existing.didoxDocumentId}` : '';
      throw new ConflictException({
        statusCode: 409,
        code: 'CONFIRMATION_REQUIRED',
        message: "Ogohlantirishlarni ko'rib chiqing",
        warnings: [
          { code: 'ALREADY_DRAFTED', message: `Qoralama allaqachon yaratilgan (${formatDate(tashkentDate(existing.draftedAt))}${id})` },
        ],
      });
    }

    const data = { amount: money(interest), didoxDocumentId: dto.didoxDocumentId || null, draftedAt: new Date() };
    const draft = await this.prisma.invoiceDraft.upsert({
      where: { contractId_month: { contractId, month } },
      create: { contractId, month, ...data },
      update: data,
    });
    return this.view(contract, month, interest, draft)!;
  }

  async unmarkDraft(month: string, contractId: string): Promise<void> {
    this.assertMonth(month);
    const { count } = await this.prisma.invoiceDraft.deleteMany({ where: { contractId, month } });
    if (!count) throw new NotFoundException('Qoralama belgisi topilmadi');
  }

  private view(
    c: InvoiceContract,
    month: string,
    interest = monthInterest(c, month, this.clock.today()),
    draft: StoredDraft | null = c.invoiceDrafts[0] ?? null,
  ): InvoiceView | null {
    const row = invoiceRow(month, interest, draft);
    if (!row) return null;
    return {
      contractId: c.id,
      lender: c.lender,
      borrower: c.borrower,
      contract: { number: c.number, signedOn: fromDbDate(c.signedOn) },
      ...row,
    };
  }

  private async find(month: string, contractId: string): Promise<InvoiceContract> {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId }, select: invoiceSelect(month) });
    if (!contract) throw new NotFoundException('Shartnoma topilmadi');
    return contract;
  }

  private assertMonth(month: string) {
    if (!MONTH.test(month)) throw new BadRequestException("Oy noto'g'ri");
  }

  private assertCompleted(month: string) {
    if (!isCompletedMonth(month, this.clock.today())) {
      throw new BadRequestException('Faktura faqat tugagan oy uchun tuziladi');
    }
  }
}
