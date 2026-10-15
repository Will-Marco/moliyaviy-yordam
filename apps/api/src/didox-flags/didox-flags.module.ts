import { Module } from '@nestjs/common';
import { DidoxFlagsController } from './didox-flags.controller.js';
import { DidoxFlagsService } from './didox-flags.service.js';

@Module({
  controllers: [DidoxFlagsController],
  providers: [DidoxFlagsService],
})
export class DidoxFlagsModule {}
