import { Global, Module } from '@nestjs/common';
import { BackupService } from './backup.service.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, BackupService],
  exports: [PrismaService],
})
export class PrismaModule {}
