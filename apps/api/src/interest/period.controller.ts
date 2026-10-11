import { Body, Controller, Get, Header, HttpCode, Post, Query, StreamableFile } from '@nestjs/common';
import { PeriodExportDto, PeriodQuery } from './dto/period.dto.js';
import { PeriodReportService } from './period-report.service.js';
import { buildPeriodWorkbook } from './xlsx.js';

@Controller('reports')
export class PeriodController {
  constructor(private readonly period: PeriodReportService) {}

  /** FR-12.2 */
  @Get('period')
  report(@Query() { from, to }: PeriodQuery) {
    return this.period.rows(from, to);
  }

  /** FR-12.3 — POST because the on-screen selection can be hundreds of IDs. */
  @Post('period.xlsx')
  @HttpCode(200)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async export(@Body() { from, to, contractIds }: PeriodExportDto): Promise<StreamableFile> {
    const report = await this.period.rowsWithContracts(from, to, contractIds);
    const name = `Davr_${from}_${to}.xlsx`;
    return new StreamableFile(await buildPeriodWorkbook(report), {
      disposition: `attachment; filename="${name}"`,
    });
  }
}
