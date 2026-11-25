import { BadRequestException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import { config } from '../config/config';

export type KeyPurpose =
  | 'access-jwt'
  | 'password-reset-jwt'
  | 'guest-meeting-hmac'
  | 'audit-chain-hmac'
  | 'totp-encryption';

const derivedCache = new Map<KeyPurpose, Buffer>();

/**
 * Cryptographic domain separation (RFC 5869 HKDF-SHA256).
 * Ensures tokens signed for one purpose (e.g. password reset or guest room)
 * can never be verified under another purpose (e.g. authenticated API access).
 */
export function deriveDomainKeyBuffer(purpose: KeyPurpose): Buffer {
  const hit = derivedCache.get(purpose);
  if (hit) return hit;
  const raw = hkdfSync(
    'sha256',
    Buffer.from(config.jwtAccessSecret, 'utf8'),
    Buffer.from('yakunex-hub-enterprise-kdf-salt-v1', 'utf8'),
    Buffer.from(`yakunex:${purpose}:v1`, 'utf8'),
    32,
  );
  const buf = Buffer.from(raw);
  derivedCache.set(purpose, buf);
  return buf;
}

export function deriveDomainSecret(purpose: Exclude<KeyPurpose, 'totp-encryption'>): string {
  return deriveDomainKeyBuffer(purpose).toString('base64url');
}

export const JWT_ISSUER = 'yakunex-hub';
export const JWT_ACCESS_AUDIENCE = 'yakunex-api';
export const JWT_RESET_AUDIENCE = 'yakunex-password-reset';

/**
 * Binds an access token to the user's current passwordHash, role, and status.
 * Changing password, role, or account status immediately invalidates active JWTs.
 */
export function computeSessionFingerprint(user: {
  passwordHash: string;
  role: string;
  status: string;
}): string {
  return createHash('sha256')
    .update(`${user.passwordHash}|${user.role}|${user.status}`)
    .digest('hex')
    .slice(0, 16);
}

// ─── Instant Session Epoch Revocation Registry ───────────────────────────────

const MAX_REVOCATION_ENTRIES = 5_000;
const userRevokedAtSec = new Map<string, number>();

export function revokeUserSessionsNow(userId: string): void {
  if (!userId) return;
  if (userRevokedAtSec.size >= MAX_REVOCATION_ENTRIES) {
    const oldestKey = userRevokedAtSec.keys().next().value;
    if (oldestKey) userRevokedAtSec.delete(oldestKey);
  }
  userRevokedAtSec.set(userId, Math.floor(Date.now() / 1000));
}

export function isTokenRevokedByEpoch(userId: string, tokenIatSeconds?: number): boolean {
  const revokedAt = userRevokedAtSec.get(userId);
  if (!revokedAt) return false;
  if (typeof tokenIatSeconds !== 'number') return true;
  return tokenIatSeconds <= revokedAt;
}

// ─── AES-256-GCM Secret Encryption at Rest (for 2FA secrets) ─────────────────

export function encryptAtRest(plaintext: string): string {
  const key = deriveDomainKeyBuffer('totp-encryption');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptAtRest(payload: string): string {
  if (!payload.startsWith('v1:')) {
    throw new Error('Unsupported encrypted payload version');
  }
  const parts = payload.split(':');
  if (parts.length !== 4) throw new Error('Malformed encrypted payload');
  const [, ivB64, tagB64, ctB64] = parts;
  const key = deriveDomainKeyBuffer('totp-encryption');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// ─── RFC 6238 TOTP (Google / Microsoft Authenticator) + Replay Guard ─────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

export function buildOtpAuthUri(accountLabel: string, base32Secret: string, issuer = 'Yakunex Hub'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(base32Secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export function generateTotpCode(base32Secret: string, timestampMs = Date.now()): string {
  const counter = Math.floor(timestampMs / 30_000);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(base32Secret);
  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

const usedTotpSteps = new Map<string, number>();

export function verifyTotpCode(
  userId: string,
  base32Secret: string,
  rawCode: string,
  nowMs = Date.now(),
): boolean {
  const code = String(rawCode ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) return false;

  const baseStep = Math.floor(nowMs / 30_000);
  for (const offset of [0, -1, 1]) {
    const step = baseStep + offset;
    const expected = generateTotpCode(base32Secret, step * 30_000);
    const a = Buffer.from(code, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      const replayKey = `${userId}:${step}`;
      if (usedTotpSteps.has(replayKey)) {
        return false; // Block OTP replay within the same 30s window
      }
      if (usedTotpSteps.size >= 5_000) {
        const first = usedTotpSteps.keys().next().value;
        if (first) usedTotpSteps.delete(first);
      }
      usedTotpSteps.set(replayKey, nowMs + 90_000);
      return true;
    }
  }
  return false;
}

export function generateBackupCodes(count = 8): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(8);
    let part = '';
    for (const b of bytes) part += alphabet[b % alphabet.length];
    codes.push(`${part.slice(0, 4)}-${part.slice(4, 8)}`);
  }
  return codes;
}

export function hashBackupCode(rawCode: string): string {
  const normalized = String(rawCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return createHmac('sha256', deriveDomainKeyBuffer('totp-encryption'))
    .update(normalized)
    .digest('hex');
}

// ─── Data-URL, Attachment & Avatar XSS Firewall ──────────────────────────────

const SAFE_IMAGE_DATA_URL_RE =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;

const SAFE_ATTACHMENT_MIME_PREFIXES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'video/mp4',
  'video/webm',
];

export function assertSafeAvatarUrl(raw: unknown, maxChars = 2_000_000): string {
  const clean = String(raw ?? '').trim();
  if (!clean) throw new BadRequestException('Profile image is required.');
  if (clean.length > maxChars) {
    throw new BadRequestException('Profile image is too large (max ~1.5 MB).');
  }
  if (/^https:\/\//i.test(clean)) {
    return clean;
  }
  if (!SAFE_IMAGE_DATA_URL_RE.test(clean)) {
    throw new BadRequestException(
      'Unsupported or unsafe profile image format. Please upload a PNG, JPG, WEBP, or GIF image.',
    );
  }
  return clean;
}

export function assertSafeAttachmentUrl(raw: unknown, maxChars = 4_500_000): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const clean = String(raw).trim();
  if (!clean) return null;
  if (clean.length > maxChars) {
    throw new BadRequestException('Attachment exceeds maximum allowed size.');
  }
  if (/^(javascript|vbscript|file):/i.test(clean)) {
    throw new BadRequestException('Unsafe attachment URL scheme blocked.');
  }
  if (/^https:\/\//i.test(clean)) {
    return clean;
  }
  const match = clean.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new BadRequestException(
      'Invalid attachment encoding. Upload a valid base64 file or HTTPS link.',
    );
  }
  const mime = match[1].toLowerCase();
  if (
    mime.includes('svg') ||
    mime.includes('html') ||
    mime.includes('javascript') ||
    mime.includes('xhtml') ||
    mime.includes('xml')
  ) {
    throw new BadRequestException('HTML, SVG, XML, and script attachments are blocked for security.');
  }
  const allowed = SAFE_ATTACHMENT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
  if (!allowed) {
    throw new BadRequestException(
      `Unsupported attachment MIME type (${mime}). Upload PDF, Office docs, CSV/TXT, ZIP, audio/video, or PNG/JPG/WEBP images.`,
    );
  }
  return clean;
}

// ─── High-Entropy Cryptographic Meeting Room Codes ───────────────────────────

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateSecureRoomCode(): string {
  const bytes = randomBytes(8);
  let chars = '';
  for (const b of bytes) {
    chars += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  }
  return `YH-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}
