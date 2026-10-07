import { Module } from '@nestjs/common';
import { ReportController } from './report.controller.js';

@Module({ controllers: [ReportController] })
export class InterestModule {}
