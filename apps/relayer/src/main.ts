import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  const allowed = process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean);
  app.enableCors({
    origin: allowed && allowed.length > 0 ? allowed : '*',
    credentials: allowed != null && allowed.length > 0,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // 0.0.0.0 explicitly: a container platform routes to the published port
  // from outside the container, and a server bound to loopback answers
  // nothing while looking perfectly healthy in its own logs.
  const build =
    process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GIT_SHA ?? 'unknown';
  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
  new Logger('Bootstrap').log(`pixstock-relayer up — build ${build}`);
}

void bootstrap();
