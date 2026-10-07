import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { fromDbDate, IsoDate, toDbDate } from '../common/dates.js';
import { formatMonth } from '../common/format.js';
import { fieldErrors } from '../common/validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContractsService } from './contracts.service.js';
import { CreateRateDto, UpdateRateDto } from './dto/rate.dto.js';
import { effectiveFromOf, retroactiveMonths } from './rates.js';

export interface RateWarning {
  code: 'RETROACTIVE';
  message: string;
}

/** Module 5: the rate history of a contract (CR-5). The first entry is the initial rate. */
@Injectable()
export class RatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractsService,
    private readonly clock: Clock,
  ) {}

  async add(contractId: string, dto: CreateRateDto) {
    const { startDate } = await this.contractDates(contractId);
    const effectiveFrom = effectiveFromOf(dto.changedOn);
    if (effectiveFrom <= startDate) {
      throw fieldErrors({ changedOn: "Stavka o'zgarishi shartnoma boshlanishidan keyin amal qilishi kerak" });
    }
    const warnings = this.confirm(retroactiveMonths(effectiveFrom, startDate, this.clock.today()), dto.confirmWarnings);
    await this.prisma.rateChange.create({
      data: {
        contractId,
        ratePercent: dto.ratePercent,
        changedOn: toDbDate(dto.changedOn),
        effectiveFrom: toDbDate(effectiveFrom),
      },
    });
    return { contract: await this.contracts.get(contractId), warnings };
  }

  async correctInitial(contractId: string, rateId: string, dto: UpdateRateDto) {
    const { startDate } = await this.contractDates(contractId);
    const rate = await this.find(contractId, rateId);
    if (!(await this.isInitial(contractId, rate.id))) {
      throw new BadRequestException("Faqat boshlang'ich stavka tuzatiladi — bu o'zgarishni o'chirib, qayta kiriting");
    }
    const warnings = this.confirm(retroactiveMonths(startDate, startDate, this.clock.today()), dto.confirmWarnings);
    await this.prisma.rateChange.update({ where: { id: rate.id }, data: { ratePercent: dto.ratePercent } });
    return { contract: await this.contracts.get(contractId), warnings };
  }

  async remove(contractId: string, rateId: string): Promise<void> {
    const rate = await this.find(contractId, rateId);
    if (await this.isInitial(contractId, rate.id)) {
      throw new BadRequestException("Boshlang'ich stavkani o'chirib bo'lmaydi — qiymatini tuzating");
    }
    await this.prisma.rateChange.delete({ where: { id: rate.id } });
  }

  /** FR-5.5: recalculating completed months needs the accountant's confirmation. */
  private confirm(months: { from: string; to: string } | null, confirmed = false): RateWarning[] {
    if (!months) return [];
    const range = months.from === months.to ? formatMonth(months.from) : `${formatMonth(months.from)} – ${formatMonth(months.to)}`;
    const warnings: RateWarning[] = [{ code: 'RETROACTIVE', message: `Tugagan oylar qayta hisoblanadi: ${range}` }];
    if (!confirmed) {
      throw new ConflictException({
        statusCode: 409,
        code: 'CONFIRMATION_REQUIRED',
        message: "Ogohlantirishlarni ko'rib chiqing",
        warnings,
      });
    }
    return warnings;
  }

  private async contractDates(contractId: string): Promise<{ startDate: IsoDate }> {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId }, select: { startDate: true } });
    if (!contract) throw new NotFoundException('Shartnoma topilmadi');
    return { startDate: fromDbDate(contract.startDate) };
  }

  private async find(contractId: string, rateId: string) {
    const rate = await this.prisma.rateChange.findFirst({ where: { id: rateId, contractId } });
    if (!rate) throw new NotFoundException('Stavka topilmadi');
    return rate;
  }

  /** The initial rate is the first one entered (created with the contract). */
  private async isInitial(contractId: string, rateId: string): Promise<boolean> {
    const first = await this.prisma.rateChange.findFirst({ where: { contractId }, orderBy: { createdAt: 'asc' } });
    return first?.id === rateId;
  }
}
