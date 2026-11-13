import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import express from 'express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

const server = express();
let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
        bufferLogs: true,
      });
      configureApp(app);
      await app.init();
    })();
  }
  await initPromise;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  await ensureInitialized();
  server(req, res);
}
