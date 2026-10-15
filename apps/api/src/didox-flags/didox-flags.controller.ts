import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { InvoiceFlagsView } from './didox-flag.js';
import { DidoxFlagsService } from './didox-flags.service.js';
import { FlagListQuery, NeedsCheckDto, SkipDto } from './dto/didox-flag.dto.js';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException("Noto'g'ri ID") });

/** M13 §4.1: written by the desktop robot (and the skip button), read by every accountant's invoices page. */
@Controller('didox-flags')
export class DidoxFlagsController {
  constructor(private readonly flags: DidoxFlagsService) {}

  /** The month's unresolved flags by contract ID — the web's `DidoxInvoiceFlags` map. */
  @Get()
  list(@Query() query: FlagListQuery): Promise<Record<string, InvoiceFlagsView>> {
    return this.flags.list(query.month);
  }

  @Put(':month/:contractId/skip')
  skip(@Param('month') month: string, @Param('contractId', uuid) contractId: string, @Body() dto: SkipDto) {
    return this.flags.skip(month, contractId, dto);
  }

  @Delete(':month/:contractId/skip')
  @HttpCode(204)
  unskip(@Param('month') month: string, @Param('contractId', uuid) contractId: string) {
    return this.flags.unskip(month, contractId);
  }

  @Post(':month/:contractId/needs-check')
  recordNeedsCheck(@Param('month') month: string, @Param('contractId', uuid) contractId: string, @Body() dto: NeedsCheckDto) {
    return this.flags.recordNeedsCheck(month, contractId, dto);
  }

  @Post(':month/:contractId/needs-check/resolve')
  @HttpCode(204)
  resolveNeedsCheck(@Param('month') month: string, @Param('contractId', uuid) contractId: string) {
    return this.flags.resolveNeedsCheck(month, contractId);
  }
}
