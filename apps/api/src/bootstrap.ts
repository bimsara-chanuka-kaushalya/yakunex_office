import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { API_VERSION } from './common/version';
import { config } from './config/config';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function configureApp(app: INestApplication): void {
  const httpAdapter = app.getHttpAdapter();
  const instance = httpAdapter.getInstance() as {
    disable?: (setting: string) => void;
    set?: (setting: string, val: unknown) => void;
  };
  instance.disable?.('x-powered-by');
  // Honor X-Forwarded-For behind Vercel/edge proxies so throttler tracks real callers.
  instance.set?.('trust proxy', 1);

  // Support up to 10 MB JSON payloads (profile avatars, 4 MB documents, 3 MB chat attachments)
  // while preserving exact rawBody bytes for GitHub webhook HMAC-SHA256 signature verification.
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ limit: '2mb', extended: true }));
  app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('X-Yakunex-Version', API_VERSION);
    next();
  });

  app.setGlobalPrefix('api');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31_536_000,
        includeSubDomains: true,
        preload: true,
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(cookieParser());

  // Global CSRF & Cross-Origin Mutation Guard for cookie-authenticated requests
  const allowedOriginSet = new Set(config.webOrigins.map((o) => o.replace(/\/$/, '').toLowerCase()));
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const method = req.method.toUpperCase();
    if (!MUTATING_METHODS.has(method)) return next();
    if (req.path.includes('/integrations/github/webhook')) return next();

    const hasAuthCookies = Boolean(req.cookies?.access_token || req.cookies?.refresh_token);
    if (!hasAuthCookies) return next();

    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/$/, '').toLowerCase() : '';
    const secFetchSite = typeof req.headers['sec-fetch-site'] === 'string' ? req.headers['sec-fetch-site'].toLowerCase() : '';

    if (originHeader && allowedOriginSet.size > 0 && !allowedOriginSet.has(originHeader)) {
      const hostOriginHttps = `https://${req.headers.host ?? ''}`.toLowerCase();
      const hostOriginHttp = `http://${req.headers.host ?? ''}`.toLowerCase();
      if (originHeader !== hostOriginHttps && originHeader !== hostOriginHttp) {
        res.status(403).json({ statusCode: 403, message: 'Cross-origin state mutation blocked by CSRF policy.' });
        return;
      }
    }

    if (secFetchSite === 'cross-site' && (!originHeader || !allowedOriginSet.has(originHeader))) {
      res.status(403).json({ statusCode: 403, message: 'Cross-site cookie mutation blocked by CSRF policy.' });
      return;
    }

    const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
    const customHeader = String(req.headers['x-requested-with'] ?? '');
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('text/plain') || contentType.includes('multipart/form-data')) {
      if (customHeader !== 'YakunexHub') {
        res.status(403).json({ statusCode: 403, message: 'CSRF verification header required for form submissions.' });
        return;
      }
    }
    next();
  });

  app.enableCors({
    origin: config.webOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'X-Meeting-Guest-Token',
      'X-Step-Up-Password',
      'If-None-Match',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
}
