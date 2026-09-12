import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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

  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
