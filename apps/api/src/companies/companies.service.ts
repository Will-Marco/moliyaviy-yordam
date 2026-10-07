import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto.js';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.company.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Firma topilmadi');
    return company;
  }

  create(dto: CreateCompanyDto) {
    return this.uniqueTin(() => this.prisma.company.create({ data: dto }));
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.get(id);
    return this.uniqueTin(() => this.prisma.company.update({ where: { id }, data: dto }));
  }

  private async uniqueTin<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu STIR bilan firma allaqachon mavjud');
      }
      throw error;
    }
  }
}
