import { readFileSync } from 'node:fs';
import { DidoxInvoiceParseError, parseDidoxInvoice } from './didox-invoice.parser.js';

const fixture = readFileSync(new URL('../../../test/fixtures/didox-invoice-ru.xls', import.meta.url), 'utf8');

/** Minimal Didox-like export in Uzbek Cyrillic (labels as shown in the Didox UI). */
const uzbekInvoice = `<html><body>
<div class="be__title">2026 йил 30.09 даги 1439-сонли Ҳисобварақ-фактура</div>
<table><tr>
<td><table>
  <tr><td>Етказиб берувчи:</td><td>"GAMMA" MCHJ</td></tr>
  <tr><td>Манзил:</td><td>Фарғона шаҳри, Mustaqillik ko'chasi, 50</td></tr>
  <tr><td>Етказиб берувчининг СТИР рақами (СТИР):</td><td>300000003</td></tr>
  <tr><td>ҚҚС тўловчининг рўйхатдан ўтиш коди:</td><td>326020000003 (гувоҳнома фаол)</td></tr>
  <tr><td>Х/Р:</td><td>20208000100000000003</td></tr>
  <tr><td>МФО:</td><td>00491 ТОШКЕНТ Ш., "ТРАСТБАНК" ХА БАНКИНИНГ БОШ ОФИСИ</td></tr>
</table></td>
<td><table>
  <tr><td>Сотиб олувчи:</td><td>"DELTA" MCHJ</td></tr>
  <tr><td>Манзил:</td><td>Андижон шаҳри</td></tr>
  <tr><td>Сотиб олувчининг СТИР рақами (СТИР):</td><td>300000004</td></tr>
  <tr><td>ҚҚС тўловчининг рўйхатдан ўтиш коди:</td><td></td></tr>
  <tr><td>Х/Р:</td><td>20208000100000000004</td></tr>
  <tr><td>МФО:</td><td>01071</td></tr>
</table></td>
</tr></table></body></html>`;

describe('parseDidoxInvoice', () => {
  it('reads the invoice header and both parties from a Russian Didox export', () => {
    expect(parseDidoxInvoice(fixture)).toEqual({
      invoiceNo: '690',
      invoiceDate: '2026-09-15',
      seller: {
        name: '"ALFA SAVDO" MCHJ',
        address: "ТАШКЕНТ ГОРОД ЧИЛАНЗАРСКИЙ РАЙОН Bunyodkor ko'chasi, 1",
        tin: '300000001',
        vatRegCode: '326020000001',
        bankAccount: '20208000100000000001',
        mfo: '01071',
      },
      buyer: {
        name: '"BETA TEXNO" MCHJ',
        address: "Самарқанд вилояти, Самарқанд шаҳри, Registon MFY, Oʻzbekiston ko'chasi, 5-uy",
        tin: '300000002',
        vatRegCode: '326020000002',
        bankAccount: '20208000100000000002',
        mfo: '00440',
      },
    });
  });

  it('reads Uzbek Cyrillic labels, bank names after MFO and an empty VAT code', () => {
    const invoice = parseDidoxInvoice(uzbekInvoice);
    expect(invoice.invoiceDate).toBe('2026-09-30');
    expect(invoice.seller).toMatchObject({ name: '"GAMMA" MCHJ', tin: '300000003', mfo: '00491' });
    expect(invoice.buyer).toMatchObject({ tin: '300000004', vatRegCode: null, bankAccount: '20208000100000000004' });
  });

  it('keeps malformed values as-is so validation can report them', () => {
    const broken = fixture.replace('300000001', '30000');
    expect(parseDidoxInvoice(broken).seller.tin).toBe('30000');
  });

  it.each([
    ['an empty file', ''],
    ['a binary Excel file', 'ÐÏ\u0011à¡±\u001aá binary'],
    ['an unrelated HTML table', '<table><tr><td>Hello</td><td>world</td></tr></table>'],
    ['an invoice without a buyer', fixture.replace('Покупатель:', 'Кто-то:')],
  ])('rejects %s', (_label, content) => {
    expect(() => parseDidoxInvoice(content)).toThrow(DidoxInvoiceParseError);
  });
});
