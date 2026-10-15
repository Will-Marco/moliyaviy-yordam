import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { MONTH } from '../invoices/dto/invoice.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FlagState, flagsByContract, invoiceFlags, InvoiceFlagsView, SKIP } from './didox-flag.js';
import { NeedsCheckDto, SkipDto } from './dto/didox-flag.dto.js';

type FlagData = Omit<Prisma.DidoxInvoiceFlagUncheckedCreateInput, 'contractId' | 'month' | 'state'>;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** M13 §4.1: the Didox robot's per-invoice flags, shared by every accountant through the server. */
@Injectable()
export class DidoxFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(month: string): Promise<Record<string, InvoiceFlagsView>> {
    return flagsByContract(await this.prisma.didoxInvoiceFlag.findMany({ where: { month, resolvedAt: null } }));
  }

  /** Idempotent: an invoice already skipped keeps its original time and install. */
  async skip(month: string, contractId: string, dto: SkipDto): Promise<InvoiceFlagsView> {
    await this.assertInvoice(month, contractId);
    const key = this.unresolved(month, contractId, 'skipped');
    if (!(await this.prisma.didoxInvoiceFlag.count({ where: key }))) {
      try {
        await this.prisma.didoxInvoiceFlag.create({ data: { ...key, ...SKIP, createdByInstall: dto.createdByInstall } });
      } catch (error) {
        // Another accountant skipped it at the same moment — the invoice is skipped either way.
        if (!isUniqueViolation(error)) throw error;
      }
    }
    return this.current(month, contractId);
  }

  /** Clearing keeps the row (resolved) as history; clearing twice is fine. */
  async unskip(month: string, contractId: string): Promise<void> {
    await this.assertInvoice(month, contractId);
    await this.resolve(month, contractId, 'skipped');
  }

  /** A newer finding about the same invoice replaces the unresolved one: the page shows one current problem. */
  async recordNeedsCheck(month: string, contractId: string, dto: NeedsCheckDto): Promise<InvoiceFlagsView> {
    await this.assertInvoice(month, contractId);
    const data: FlagData = {
      code: dto.code,
      message: dto.message,
      didoxDocumentId: dto.didoxId ?? null,
      candidateIds: dto.candidateIds ?? [],
      runId: dto.runId ?? null,
      createdByInstall: dto.createdByInstall,
      createdAt: new Date(),
    };
    if (!(await this.replace(month, contractId, data))) {
      try {
        await this.prisma.didoxInvoiceFlag.create({ data: { ...this.unresolved(month, contractId, 'needs_check'), ...data } });
      } catch (error) {
        // Recorded by another run in between: replace that one instead.
        if (!isUniqueViolation(error) || !(await this.replace(month, contractId, data))) throw error;
      }
    }
    return this.current(month, contractId);
  }

  async resolveNeedsCheck(month: string, contractId: string): Promise<void> {
    await this.assertInvoice(month, contractId);
    if (!(await this.resolve(month, contractId, 'needs_check'))) {
      throw new NotFoundException('Tekshiruv belgisi topilmadi');
    }
  }

  private async replace(month: string, contractId: string, data: FlagData): Promise<boolean> {
    const { count } = await this.prisma.didoxInvoiceFlag.updateMany({
      where: this.unresolved(month, contractId, 'needs_check'),
      data,
    });
    return count > 0;
  }

  private async resolve(month: string, contractId: string, state: FlagState): Promise<boolean> {
    const { count } = await this.prisma.didoxInvoiceFlag.updateMany({
      where: this.unresolved(month, contractId, state),
      data: { resolvedAt: new Date() },
    });
    return count > 0;
  }

  private async current(month: string, contractId: string): Promise<InvoiceFlagsView> {
    return invoiceFlags(await this.prisma.didoxInvoiceFlag.findMany({ where: { month, contractId, resolvedAt: null } }));
  }

  private unresolved(month: string, contractId: string, state: FlagState) {
    return { month, contractId, state, resolvedAt: null };
  }

  private async assertInvoice(month: string, contractId: string): Promise<void> {
    if (!MONTH.test(month)) throw new BadRequestException("Oy noto'g'ri");
    if (!(await this.prisma.contract.count({ where: { id: contractId } }))) {
      throw new NotFoundException('Shartnoma topilmadi');
    }
  }
}
