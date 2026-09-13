import { Module } from '@nestjs/common';
import { NoncesModule } from '../nonces/nonces.module';
import { PythModule } from '../pyth/pyth.module';
import { HealthController } from './health.controller';

@Module({ imports: [NoncesModule, PythModule], controllers: [HealthController] })
export class HealthModule {}
