import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { reportView } from './report.js';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException("Noto'g'ri ID") });

@Controller('contracts/:id/report')
export class ReportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** FR-4.1/4.2 — the single result the screen, Excel (M6) and invoices (M8) use (CONSTITUTION §11). */
  @Get()
  async report(@Param('id', uuid) id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      select: {
        startDate: true,
        rateChanges: { orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }] },
        operations: { select: { date: true, type: true, amount: true } },
      },
    });
    if (!contract) throw new NotFoundException('Shartnoma topilmadi');
    return reportView(contract, this.clock.today());
  }
}
