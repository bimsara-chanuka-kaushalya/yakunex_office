// Central, validated configuration. Fails fast at boot when a secret is missing or weak.
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function loadDotEnvFiles(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../.env'),
    resolve(__dirname, '../../../../.env'),
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    try {
      const content = readFileSync(filePath, 'utf8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    } catch {
      // Ignore unreadable .env file and rely on process.env
    }
  }
}

loadDotEnvFiles();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadConfig() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const jwtAccessSecret = required('JWT_ACCESS_SECRET');

  if (jwtAccessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters long.');
  }

  return {
    nodeEnv,
    isProd: nodeEnv === 'production',
    port: Number(process.env.API_PORT ?? 4000),
    webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:3000,http://localhost:3001')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    jwtAccessSecret,
    databaseUrl: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlDays: 7,
    maxFailedLogins: 5,
    lockoutMinutes: 15,
  } as const;
}

export const config = loadConfig();
