import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CompaniesService } from './companies.service.js';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto.js';
import { CompanyImportService } from './import/company-import.service.js';
import { ImportCompaniesDto } from './import/import.dto.js';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException("Noto'g'ri ID") });

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly importer: CompanyImportService,
  ) {}

  @Get()
  list() {
    return this.companies.list();
  }

  @Post('import/preview')
  @HttpCode(200)
  previewImport(@Body() dto: ImportCompaniesDto) {
    return this.importer.preview(dto.files);
  }

  @Post('import')
  @HttpCode(200)
  applyImport(@Body() dto: ImportCompaniesDto) {
    return this.importer.apply(dto.files);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.companies.get(id);
  }

  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.companies.create(dto);
  }

  @Patch(':id')
  update(@Param('id', uuid) id: string, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(id, dto);
  }
}
