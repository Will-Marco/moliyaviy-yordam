import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';
import { RatesController } from './rates.controller.js';
import { RatesService } from './rates.service.js';

@Module({
  controllers: [ContractsController, RatesController],
  providers: [ContractsService, RatesService],
})
export class ContractsModule {}
