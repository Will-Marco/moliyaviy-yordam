import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { ExportController } from './export.controller.js';
import { PeriodReportService } from './period-report.service.js';
import { PeriodController } from './period.controller.js';
import { ReportController } from './report.controller.js';

@Module({
  imports: [ContractsModule, OperationsModule],
  controllers: [ReportController, ExportController, PeriodController],
  providers: [PeriodReportService],
})
export class InterestModule {}
