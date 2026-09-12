import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { MarketModule } from './modules/market/market.module';
import { OrdersModule } from './modules/orders/orders.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { VaultsModule } from './modules/vaults/vaults.module';
import { appConfig, databaseConfig, solanaConfig, relayerConfig } from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, solanaConfig, relayerConfig],
    }),
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    HealthModule,
    MarketModule,
    OrdersModule,
    QuotesModule,
    VaultsModule,
    // Still to come — see docs/ARCHITECTURE.md: PythModule, NoncesModule,
    // RelayerModule (co-signing and broadcast), VaultsModule.
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
