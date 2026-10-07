import { BadRequestException, Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CreateRateDto, UpdateRateDto } from './dto/rate.dto.js';
import { RatesService } from './rates.service.js';

const uuid = new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException("Noto'g'ri ID") });

@Controller('contracts/:contractId/rates')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Post()
  add(@Param('contractId', uuid) contractId: string, @Body() dto: CreateRateDto) {
    return this.rates.add(contractId, dto);
  }

  @Patch(':id')
  correctInitial(
    @Param('contractId', uuid) contractId: string,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateRateDto,
  ) {
    return this.rates.correctInitial(contractId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('contractId', uuid) contractId: string, @Param('id', uuid) id: string) {
    return this.rates.remove(contractId, id);
  }
}
