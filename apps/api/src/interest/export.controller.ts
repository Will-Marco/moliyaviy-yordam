import { BadRequestException, Controller, Get, Header, NotFoundException, Param, ParseUUIDPipe, StreamableFile } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { OperationsService } from '../operations/operations.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { reportView } from './report.js';
import { buildReportWorkbook, reportFileName } from './xlsx.js';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException("Noto'g'ri ID") });

@Controller('contracts/:id/report.xlsx')
export class ExportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
    private readonly operations: OperationsService,
    private readonly clock: Clock,
  ) {}

  /** FR-6.1: the monthly report as Excel, from the same result as the screen. */
  @Get()
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async export(@Param('id', uuid) id: string): Promise<StreamableFile> {
    const contract = await this.contracts.get(id);
    const record = await this.prisma.contract.findUnique({
      where: { id },
      select: {
        startDate: true,
        rateChanges: { orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }] },
        operations: { select: { date: true, type: true, amount: true } },
      },
    });
    if (!record) throw new NotFoundException('Shartnoma topilmadi');
    const asOf = this.clock.today();
    const file = await buildReportWorkbook(contract, reportView(record, asOf), await this.operations.list(id));
    const name = reportFileName(contract, asOf);
    return new StreamableFile(file, {
      disposition: `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
  }
}
