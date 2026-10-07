import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ContractsService } from './contracts.service.js';
import { CreateContractDto, UpdateContractDto } from './dto/contract.dto.js';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException("Noto'g'ri ID") });

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  list() {
    return this.contracts.list();
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.contracts.get(id);
  }

  @Post()
  create(@Body() dto: CreateContractDto) {
    return this.contracts.create(dto);
  }

  @Patch(':id')
  update(@Param('id', uuid) id: string, @Body() dto: UpdateContractDto) {
    return this.contracts.update(id, dto);
  }
}
