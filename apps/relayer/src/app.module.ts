import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { appConfig, databaseConfig, solanaConfig, relayerConfig } from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, solanaConfig, relayerConfig],
    }),
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    // Domain modules land here as they are built — see docs/ARCHITECTURE.md:
    // OrdersModule, QuotesModule, TxBuilderModule, PythModule, NoncesModule,
    // RelayerModule, VaultsModule, MarketModule, HealthModule.
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
