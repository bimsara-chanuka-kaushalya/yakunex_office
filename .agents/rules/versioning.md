---
description: Semantic Versioning policy for Yakunex Hub (vMAJOR.MINOR.PATCH)
alwaysApply: true
---

# Yakunex Hub Semantic Versioning Rule

Every code update, bug fix, or new feature in Yakunex Hub MUST bump the system version consistently across the workspace using Semantic Versioning (`vMAJOR.MINOR.PATCH`), starting from `v1.0.0`:

1. **Patch (`v1.0.x` → e.g. `v1.0.1`, `v1.0.2`)** — Decide automatically when making:
   - Bug fixes, click-point fixes, security patches, performance optimizations, or minor UI/UX polish.
2. **Minor (`v1.x.0` → e.g. `v1.1.0`, `v1.2.0`)** — Decide automatically when adding:
   - New features, new modules, new pages, new reports/exports, or significant new capabilities.
3. **Major (`vX.0.0` → e.g. `v2.0.0`)** — **STRICT USER-ONLY GATE**:
   - NEVER bump the Major version on your own.
   - Bump the Major version **ONLY** when the user explicitly requests a major system update (e.g. "විශාල System Update එකක්" / "Major System Update").

## How to Apply a Version Bump
- Run `node scripts/bump-version.mjs patch` (or `minor` / `major`) to keep `package.json`, `apps/web/package.json`, and `apps/api/package.json` synchronized (both `apps/web/src/lib/version.ts` and `apps/api/src/common/version.ts` read directly from their `package.json`).
- Add a concise dated entry to `CHANGELOG.md` under the new version heading.
- Mention the new version number (e.g. `v1.0.1`) in the commit message and user summary.
