import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { validateEnv } from './config/env.js';
import { ContractsModule } from './contracts/contracts.module.js';
import { DidoxFlagsModule } from './didox-flags/didox-flags.module.js';
import { InterestModule } from './interest/interest.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    CommonModule,
    AuthModule,
    CompaniesModule,
    ContractsModule,
    OperationsModule,
    InterestModule,
    InvoicesModule,
    DidoxFlagsModule,
  ],
})
export class AppModule {}
