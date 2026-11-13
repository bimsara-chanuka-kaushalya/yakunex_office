import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { config } from './config/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  app.enableShutdownHooks();

  await app.listen(config.port);
  console.log(`Yakunex Hub API listening on port ${config.port} (${config.nodeEnv})`);
}

void bootstrap();
