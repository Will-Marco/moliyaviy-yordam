import { HTMLElement, parse } from 'node-html-parser';

/** Requisites of one party, exactly as printed in the invoice (validated later with CreateCompanyDto). */
export interface InvoiceParty {
  name: string;
  address: string;
  tin: string;
  vatRegCode: string | null;
  bankAccount: string;
  mfo: string;
}

export interface DidoxInvoice {
  invoiceNo: string | null;
  /** ISO date (yyyy-mm-dd) */
  invoiceDate: string | null;
  seller: InvoiceParty;
  buyer: InvoiceParty;
}

export class DidoxInvoiceParseError extends Error {
  constructor() {
    super('Didox schyot-faktura fayli tanilmadi');
  }
}

// Didox exports the "Счет-фактура" as an HTML table saved with an .xls extension (SRS §9.1).
// Labels exist in Russian (verified with a real export) and Uzbek Cyrillic (from the Didox UI).
const ROLE_LABELS: Record<string, 'seller' | 'buyer'> = {
  поставщик: 'seller',
  'етказиб берувчи': 'seller',
  покупатель: 'buyer',
  'сотиб олувчи': 'buyer',
  харидор: 'buyer',
};

type Field = Exclude<keyof InvoiceParty, 'name'>;
type Draft = { [K in keyof InvoiceParty]?: string | null };
const FIELD_LABELS: [RegExp, Field][] = [
  [/^(адрес|манзил)/i, 'address'],
  [/(инн|стир)/i, 'tin'],
  [/(ндс|ққс)/i, 'vatRegCode'],
  [/^(р\/с|х\/р|ҳ\/р|расчетный|ҳисоб)/i, 'bankAccount'],
  [/^мфо/i, 'mfo'],
];

const clean = (text: string) => text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const digits = (text: string) => text.replace(/\D/g, '');
const firstRun = (text: string, length: number) => text.match(new RegExp(`\\d{${length}}`))?.[0] ?? null;

export function parseDidoxInvoice(html: string): DidoxInvoice {
  const root = parse(html);
  const parties: Partial<Record<'seller' | 'buyer', Draft>> = {};
  let current: Draft | undefined;

  for (const row of root.querySelectorAll('tr')) {
    const cells = row.childNodes.filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node.tagName === 'TD',
    );
    // Only leaf "label: value" rows; outer layout rows contain nested tables.
    if (cells.length !== 2 || cells.some((cell) => cell.querySelector('table'))) continue;
    const label = clean(cells[0].text).replace(/:$/, '').toLowerCase();
    const value = clean(cells[1].text);

    const role = ROLE_LABELS[label];
    if (role) {
      current = parties[role] = { name: value };
      continue;
    }
    const field = current && FIELD_LABELS.find(([pattern]) => pattern.test(label))?.[1];
    if (current && field && current[field] === undefined) current[field] = parseField(field, value);
  }

  const { seller, buyer } = parties;
  if (!seller?.name || !buyer?.name) throw new DidoxInvoiceParseError();
  return { ...parseTitle(root), seller: complete(seller), buyer: complete(buyer) };
}

function parseField(field: Field, value: string): string | null {
  switch (field) {
    case 'vatRegCode':
      return firstRun(value, 12);
    case 'mfo':
      // "00491 ТОШКЕНТ Ш., ..." — the bank name may follow the code.
      return firstRun(value, 5) ?? digits(value);
    case 'tin':
    case 'bankAccount':
      return digits(value) || value;
    case 'address':
      return value;
  }
}

function complete(party: Draft): InvoiceParty {
  return {
    name: party.name ?? '',
    address: party.address ?? '',
    tin: party.tin ?? '',
    vatRegCode: party.vatRegCode ?? null,
    bankAccount: party.bankAccount ?? '',
    mfo: party.mfo ?? '',
  };
}

function parseTitle(root: HTMLElement): Pick<DidoxInvoice, 'invoiceNo' | 'invoiceDate'> {
  const title = clean((root.querySelector('.be__title') ?? root.querySelector('th'))?.text ?? '');
  const russian = title.match(/№\s*(\S+)\s+от\s+(\d{2})\.(\d{2})\.(\d{4})/i);
  if (russian) return { invoiceNo: russian[1], invoiceDate: `${russian[4]}-${russian[3]}-${russian[2]}` };
  // Uzbek: "2026 йил 30.09 даги 1439-сонли ..." or any dd.mm.yyyy.
  const uzbek = title.match(/(\d{4})\s*йил\s*(\d{2})\.(\d{2})\s*даги\s*(\S+?)-сонли/i);
  if (uzbek) return { invoiceNo: uzbek[4], invoiceDate: `${uzbek[1]}-${uzbek[3]}-${uzbek[2]}` };
  const date = title.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return { invoiceNo: null, invoiceDate: date ? `${date[3]}-${date[2]}-${date[1]}` : null };
}
