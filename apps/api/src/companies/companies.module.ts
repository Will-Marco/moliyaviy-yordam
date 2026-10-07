import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { CompanyImportService } from './import/company-import.service.js';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyImportService],
})
export class CompaniesModule {}
