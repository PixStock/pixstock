import { Module } from '@nestjs/common';
import { NoncesModule } from '../nonces/nonces.module';
import { HealthController } from './health.controller';

@Module({ imports: [NoncesModule], controllers: [HealthController] })
export class HealthModule {}
