import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { InvoiceListQuery, MarkDraftDto } from './dto/invoice.dto.js';
import { InvoicesService } from './invoices.service.js';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException("Noto'g'ri ID") });

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  /** FR-7.1 — defaults to last month. */
  @Get()
  list(@Query() query: InvoiceListQuery) {
    return this.invoices.list(query.month);
  }

  /** FR-7.4 — mark by hand as drafted in Didox (Module 8 will do it automatically). */
  @Put(':month/:contractId/draft')
  markDraft(@Param('month') month: string, @Param('contractId', uuid) contractId: string, @Body() dto: MarkDraftDto) {
    return this.invoices.markDraft(month, contractId, dto);
  }

  @Delete(':month/:contractId/draft')
  @HttpCode(204)
  unmarkDraft(@Param('month') month: string, @Param('contractId', uuid) contractId: string) {
    return this.invoices.unmarkDraft(month, contractId);
  }
}
