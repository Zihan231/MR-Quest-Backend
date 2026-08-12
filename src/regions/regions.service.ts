import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Division } from './entities/division.entity';
import { District } from './entities/district.entity';
import { Upazila } from './entities/upazila.entity';
import { BANGLADESH_REGIONS } from './data/bangladesh-regions';

@Injectable()
export class RegionsService {
  constructor(
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
    @InjectRepository(District)
    private readonly districtRepository: Repository<District>,
    @InjectRepository(Upazila)
    private readonly upazilaRepository: Repository<Upazila>,
  ) {}

  async getDivisions(): Promise<{ name: string; districtCount: number }[]> {
    const divisions = await this.divisionRepository.find({
      relations: { districts: true },
    });
    return divisions.map((division) => ({
      name: division.name,
      districtCount: division.districts.length,
    }));
  }

  async getDistricts(
    division: string,
  ): Promise<{ name: string; upazilaCount: number }[]> {
    const found = await this.divisionRepository.findOne({
      where: { name: division },
      relations: { districts: { upazilas: true } },
    });
    if (!found) {
      throw new BadRequestException(`Division "${division}" not found`);
    }
    return found.districts.map((district) => ({
      name: district.name,
      upazilaCount: district.upazilas.length,
    }));
  }

  async getUpazilas(division: string, district: string): Promise<string[]> {
    const divisionData = await this.divisionRepository.findOne({
      where: { name: division },
    });
    if (!divisionData) {
      throw new BadRequestException(`Division "${division}" not found`);
    }
    const upazilas = await this.upazilaRepository.find({
      where: { district: { divisionId: divisionData.id, name: district } },
    });
    if (upazilas.length === 0) {
      throw new BadRequestException(
        `District "${district}" not found in division "${division}"`,
      );
    }
    return upazilas.map((upazila) => upazila.name);
  }

  async seedRegions(): Promise<{
    divisions: number;
    districts: number;
    upazilas: number;
  }> {
    const existing = await this.divisionRepository.count();
    if (existing === 0) {
      const divisions = BANGLADESH_REGIONS.map((division) =>
        this.divisionRepository.create({
          name: division.name,
          districts: division.districts.map((district) =>
            this.districtRepository.create({
              name: district.name,
              upazilas: district.upazilas.map((upazila) =>
                this.upazilaRepository.create({ name: upazila }),
              ),
            }),
          ),
        }),
      );
      await this.divisionRepository.save(divisions);
    }
    return {
      divisions: await this.divisionRepository.count(),
      districts: await this.districtRepository.count(),
      upazilas: await this.upazilaRepository.count(),
    };
  }
}