import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Clock, tashkentDate } from '../common/clock.js';
import { fromDbDate } from '../common/dates.js';
import { formatDate } from '../common/format.js';
import { Prisma } from '../generated/prisma/client.js';
import { toTiyin } from '../interest/engine.js';
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
    if (dto.expectedAmount !== undefined && toTiyin(dto.expectedAmount) !== interest) {
      throw new ConflictException({
        statusCode: 409,
        code: 'AMOUNT_CHANGED',
        message: `Summa o'zgargan: Didox'dagi qoralamada ${money(toTiyin(dto.expectedAmount))}, hozirgi hisob ${money(interest)}`,
      });
    }

    const existing = contract.invoiceDrafts[0];
    if (existing && !dto.confirmWarnings) {
      const when = formatDate(tashkentDate(existing.draftedAt));
      // A hand mark without an ID plus a draft the app just saved usually means two drafts now exist in Didox.
      const warning =
        dto.source === 'didox' && existing.didoxDocumentId === null
          ? { code: 'POSSIBLE_DUPLICATE', message: `Bu oy ${when} da qo'lda belgilangan — Didox'da ikkita qoralama bo'lishi mumkin, tekshiring` }
          : {
              code: 'ALREADY_DRAFTED',
              message: `Qoralama allaqachon yaratilgan (${when}${existing.didoxDocumentId ? `, Didox ID: ${existing.didoxDocumentId}` : ''})`,
            };
      throw new ConflictException({ statusCode: 409, code: 'CONFIRMATION_REQUIRED', message: "Ogohlantirishlarni ko'rib chiqing", warnings: [warning] });
    }

    // Re-marking without a new ID keeps the recorded one (and who made it): the link to the Didox document is not lost.
    const keepsId = !dto.didoxDocumentId && !!existing?.didoxDocumentId;
    const data = {
      amount: money(interest),
      didoxDocumentId: dto.didoxDocumentId || existing?.didoxDocumentId || null,
      draftedAt: new Date(),
      source: keepsId ? existing!.source : (dto.source ?? 'manual'),
    };
    const draft = await this.write(contractId, month, existing, data);
    return this.view(contract, month, interest, draft)!;
  }

  /**
   * Writes only over the state the decision above was made on: a mark created or changed meanwhile (another click,
   * the desktop app) fails with 409 instead of being silently overwritten.
   */
  private async write(contractId: string, month: string, seen: StoredDraft & { id: string; updatedAt: Date } | undefined, data: Omit<Prisma.InvoiceDraftCreateManyInput, 'contractId' | 'month'>) {
    const changed = () =>
      new ConflictException({ statusCode: 409, code: 'DRAFT_CHANGED', message: "Bu faktura belgisi shu payt o'zgardi — sahifani yangilab qayta urining" });
    if (!seen) {
      try {
        return await this.prisma.invoiceDraft.create({ data: { contractId, month, ...data } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw changed();
        throw error;
      }
    }
    const { count } = await this.prisma.invoiceDraft.updateMany({ where: { id: seen.id, updatedAt: seen.updatedAt }, data });
    if (!count) throw changed();
    return this.prisma.invoiceDraft.findUniqueOrThrow({ where: { id: seen.id } });
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
