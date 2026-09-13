import { Module } from '@nestjs/common';
import { PythService } from './pyth.service';

@Module({
  providers: [PythService],
  exports: [PythService],
})
export class PythModule {}
