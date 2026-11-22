#!/usr/bin/env node
/**
 * Sync-bumps the Semantic Version across root, web, and api package.json files.
 * Usage:
 *   node scripts/bump-version.mjs patch
 *   node scripts/bump-version.mjs minor
 *   node scripts/bump-version.mjs major
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kind = (process.argv[2] || '').toLowerCase();

if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major>');
  process.exit(1);
}

const files = [
  path.join(rootDir, 'package.json'),
  path.join(rootDir, 'apps', 'web', 'package.json'),
  path.join(rootDir, 'apps', 'api', 'package.json'),
];

const rootPkg = JSON.parse(fs.readFileSync(files[0], 'utf8'));
const [maj, min, pat] = String(rootPkg.version || '1.0.0')
  .split('.')
  .map((n) => Number.parseInt(n, 10) || 0);

let nextVersion = `${maj}.${min}.${pat}`;
if (kind === 'major') nextVersion = `${maj + 1}.0.0`;
if (kind === 'minor') nextVersion = `${maj}.${min + 1}.0`;
if (kind === 'patch') nextVersion = `${maj}.${min}.${pat + 1}`;

for (const filePath of files) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const updated = raw.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${nextVersion}"`);
  fs.writeFileSync(filePath, updated, 'utf8');
}

console.log(`Bumped Yakunex Hub version: v${rootPkg.version} -> v${nextVersion}`);
