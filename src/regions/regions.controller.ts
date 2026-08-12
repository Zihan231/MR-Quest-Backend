import { Controller, Get, Param } from '@nestjs/common';
import { RegionsService } from './regions.service';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get('divisions')
  getDivisions() {
    return this.regionsService.getDivisions();
  }

  @Get('divisions/:division/districts')
  getDistricts(@Param('division') division: string) {
    return this.regionsService.getDistricts(division);
  }

  @Get('divisions/:division/districts/:district/upazilas')
  getUpazilas(
    @Param('division') division: string,
    @Param('district') district: string,
  ) {
    return this.regionsService.getUpazilas(division, district);
  }
}
