import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';
import { Division } from './entities/division.entity';
import { District } from './entities/district.entity';
import { Upazila } from './entities/upazila.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Division, District, Upazila])],
  controllers: [RegionsController],
  providers: [RegionsService],
  exports: [RegionsService],
})
export class RegionsModule {}