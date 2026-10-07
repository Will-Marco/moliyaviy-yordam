import { Injectable, NotFoundException } from '@nestjs/common';
import { Clock } from '../common/clock.js';
import { toDbDate } from '../common/dates.js';
import { fieldErrors } from '../common/validation.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { contractInclude, ContractView, toContractView } from './contract.view.js';
import { CreateContractDto, UpdateContractDto } from './dto/contract.dto.js';

type Terms = Pick<CreateContractDto, 'lenderId' | 'borrowerId' | 'startDate' | 'endDate'>;

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<ContractView[]> {
    const records = await this.prisma.contract.findMany({
      include: contractInclude,
      orderBy: [{ signedOn: 'desc' }, { number: 'asc' }],
    });
    const today = this.clock.today();
    return records.map((r) => toContractView(r, today, false));
  }

  async get(id: string): Promise<ContractView> {
    const record = await this.prisma.contract.findUnique({ where: { id }, include: contractInclude });
    if (!record) throw new NotFoundException('Shartnoma topilmadi');
    return toContractView(record, this.clock.today(), true);
  }

  async create(dto: CreateContractDto): Promise<ContractView> {
    await this.assertTerms(dto);
    const record = await this.uniqueNumber(() =>
      this.prisma.contract.create({
        data: {
          number: dto.number,
          signedOn: toDbDate(dto.signedOn),
          lenderId: dto.lenderId,
          borrowerId: dto.borrowerId,
          limitAmount: dto.limitAmount,
          startDate: toDbDate(dto.startDate),
          endDate: toDbDate(dto.endDate),
          // CR-5: the initial rate is in force from the start date.
          rateChanges: {
            create: {
              ratePercent: dto.ratePercent,
              changedOn: toDbDate(dto.signedOn),
              effectiveFrom: toDbDate(dto.startDate),
            },
          },
        },
        include: contractInclude,
      }),
    );
    return toContractView(record, this.clock.today(), true);
  }

  async update(id: string, dto: UpdateContractDto): Promise<ContractView> {
    const current = await this.get(id);
    await this.assertTerms({
      lenderId: dto.lenderId ?? current.lender.id,
      borrowerId: dto.borrowerId ?? current.borrower.id,
      startDate: dto.startDate ?? current.startDate,
      endDate: dto.endDate ?? current.endDate,
    });
    const record = await this.uniqueNumber(() =>
      this.prisma.$transaction(async (tx) => {
        // CR-5: the initial rate is entered on signing and is in force from the start date.
        if (dto.startDate || dto.signedOn) {
          const initial = await tx.rateChange.findFirstOrThrow({
            where: { contractId: id },
            orderBy: { createdAt: 'asc' },
          });
          await tx.rateChange.update({
            where: { id: initial.id },
            data: {
              effectiveFrom: dto.startDate && toDbDate(dto.startDate),
              changedOn: dto.signedOn && toDbDate(dto.signedOn),
            },
          });
        }
        return tx.contract.update({
          where: { id },
          data: {
            number: dto.number,
            signedOn: dto.signedOn && toDbDate(dto.signedOn),
            lenderId: dto.lenderId,
            borrowerId: dto.borrowerId,
            limitAmount: dto.limitAmount,
            startDate: dto.startDate && toDbDate(dto.startDate),
            endDate: dto.endDate && toDbDate(dto.endDate),
          },
          include: contractInclude,
        });
      }),
    );
    return toContractView(record, this.clock.today(), true);
  }

  /** FR-2.2 rules that span fields or need the database. */
  private async assertTerms({ lenderId, borrowerId, startDate, endDate }: Terms): Promise<void> {
    const errors: Record<string, string> = {};
    if (endDate <= startDate) errors.endDate = "Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak";
    if (lenderId === borrowerId) errors.borrowerId = "Beruvchi va oluvchi bir xil firma bo'lishi mumkin emas";
    const found = await this.prisma.company.findMany({
      where: { id: { in: [lenderId, borrowerId] } },
      select: { id: true },
    });
    const ids = new Set(found.map((c) => c.id));
    if (!ids.has(lenderId)) errors.lenderId = 'Firma topilmadi';
    if (!ids.has(borrowerId)) errors.borrowerId = 'Firma topilmadi';
    if (Object.keys(errors).length) throw fieldErrors(errors);
  }

  /** FR-2.4: the number is unique within a lender–borrower pair. */
  private async uniqueNumber<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw fieldErrors({ number: "Bu tomonlar o'rtasida shu raqamli shartnoma allaqachon mavjud" }, 409);
      }
      throw error;
    }
  }
}
