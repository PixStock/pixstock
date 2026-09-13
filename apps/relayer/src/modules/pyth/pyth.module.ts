import { Module } from '@nestjs/common';
import { PythController } from './pyth.controller';
import { PythService } from './pyth.service';

@Module({
  controllers: [PythController],
  providers: [PythService],
  exports: [PythService],
})
export class PythModule {}
