import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CreateOperationDto, UpdateOperationDto } from './dto/operation.dto.js';
import { OperationsService } from './operations.service.js';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException("Noto'g'ri ID") });

@Controller('contracts/:contractId/operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get()
  list(@Param('contractId', uuid) contractId: string) {
    return this.operations.list(contractId);
  }

  @Post()
  create(@Param('contractId', uuid) contractId: string, @Body() dto: CreateOperationDto) {
    return this.operations.create(contractId, dto);
  }

  @Patch(':id')
  update(
    @Param('contractId', uuid) contractId: string,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateOperationDto,
  ) {
    return this.operations.update(contractId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('contractId', uuid) contractId: string, @Param('id', uuid) id: string) {
    return this.operations.remove(contractId, id);
  }
}
