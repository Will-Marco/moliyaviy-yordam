import { ConflictException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateCompanyDto } from '../dto/company.dto.js';
import { DidoxInvoiceParseError, InvoiceParty, parseDidoxInvoice } from './didox-invoice.parser.js';
import { ImportFileDto } from './import.dto.js';

type CompanyField = keyof InvoiceParty;
const FIELDS: CompanyField[] = ['name', 'address', 'tin', 'vatRegCode', 'bankAccount', 'mfo'];

export interface ImportItem extends InvoiceParty {
  status: 'create' | 'update' | 'unchanged' | 'error';
  /** Fields that differ from the stored company (status `update`). */
  changes: CompanyField[];
  /** Validation errors per field (status `error`). */
  errors: Record<string, string[]>;
  source: { file: string; invoiceNo: string | null; invoiceDate: string | null };
}

export interface ImportPreview {
  items: ImportItem[];
  fileErrors: { file: string; message: string }[];
}

export interface ImportResult extends ImportPreview {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

/** FR-1.3: companies from Didox invoice exports — preview first, then apply. */
@Injectable()
export class CompanyImportService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(files: ImportFileDto[]): Promise<ImportPreview> {
    const fileErrors: ImportPreview['fileErrors'] = [];
    // Keyed by STIR; a party whose STIR could not be read gets its own key so it is still reported.
    const byTin = new Map<string, Omit<ImportItem, 'status' | 'changes' | 'errors'>>();

    for (const file of files) {
      let invoice;
      try {
        invoice = parseDidoxInvoice(file.content);
      } catch (error) {
        if (!(error instanceof DidoxInvoiceParseError)) throw error;
        fileErrors.push({ file: file.name, message: error.message });
        continue;
      }
      const source = { file: file.name, invoiceNo: invoice.invoiceNo, invoiceDate: invoice.invoiceDate };
      for (const [role, party] of [['seller', invoice.seller], ['buyer', invoice.buyer]] as const) {
        const key = party.tin || `${file.name}#${role}`;
        const seen = byTin.get(key);
        // The newest invoice carries the most current requisites.
        if (!seen || (source.invoiceDate ?? '') > (seen.source.invoiceDate ?? '')) {
          byTin.set(key, { ...party, source });
        }
      }
    }

    const candidates = [...byTin.values()];
    const existing = await this.prisma.company.findMany({
      where: { tin: { in: candidates.map((c) => c.tin) } },
    });
    const stored = new Map(existing.map((c) => [c.tin, c]));

    const items = await Promise.all(
      candidates.map(async (parsed): Promise<ImportItem> => {
        const current = stored.get(parsed.tin);
        // An invoice without a VAT code never erases one already on file.
        const candidate = { ...parsed, vatRegCode: parsed.vatRegCode ?? current?.vatRegCode ?? null };
        const errors = await validationErrors(candidate);
        if (Object.keys(errors).length) return { ...candidate, status: 'error', changes: [], errors };
        if (!current) return { ...candidate, status: 'create', changes: [], errors: {} };
        const changes = FIELDS.filter((field) => (current[field] ?? null) !== (candidate[field] ?? null));
        return { ...candidate, status: changes.length ? 'update' : 'unchanged', changes, errors: {} };
      }),
    );
    items.sort((a, b) => a.tin.localeCompare(b.tin));
    return { items, fileErrors };
  }

  async apply(files: ImportFileDto[]): Promise<ImportResult> {
    const preview = await this.preview(files);
    const data = ({ name, address, tin, vatRegCode, bankAccount, mfo }: ImportItem): InvoiceParty => ({
      name,
      address,
      tin,
      vatRegCode,
      bankAccount,
      mfo,
    });

    try {
      await this.prisma.$transaction(
        preview.items.flatMap((item) => {
          if (item.status === 'create') return [this.prisma.company.create({ data: data(item) })];
          if (item.status === 'update') {
            return [this.prisma.company.update({ where: { tin: item.tin }, data: data(item) })];
          }
          return [];
        }),
      );
    } catch (error) {
      // Someone added one of these companies between our read and write; nothing was saved.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException("Firmalar ro'yxati shu paytda o'zgardi. Importni qayta bosing.");
      }
      throw error;
    }

    const count = (status: ImportItem['status']) => preview.items.filter((i) => i.status === status).length;
    return {
      ...preview,
      created: count('create'),
      updated: count('update'),
      unchanged: count('unchanged'),
      skipped: count('error'),
    };
  }
}

/** Same rules as manual entry (FR-1.2): reuse CreateCompanyDto instead of duplicating them. */
async function validationErrors(party: InvoiceParty): Promise<Record<string, string[]>> {
  const errors = await validate(plainToInstance(CreateCompanyDto, party));
  return Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})]));
}
