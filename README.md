# Yakunex Hub

An integrated IT project, workforce management, and collaboration platform by Yakunex Technologies (Pvt) Ltd.
It combines project delivery (Jira-style), time and attendance (Jibble-style), and built-in video & audio meetings
(Zoom-style) in one unified system. Product name: **Yakunex Hub**.

> **Status: Phase 1 is built.** Authentication, role-based access control, user management, and the
> role-based dashboard are implemented end to end. All other modules are defined in the database
> schema and listed in the navigation with their scheduled phase. They are not yet functional, and the
> app says so instead of showing placeholder numbers.

## What is in this release

| Area | Status | Notes |
|---|---|---|
| Sign in / sign out | Done | Argon2id password hashing, HttpOnly cookies, 15-minute access tokens |
| Refresh-token rotation | Done | Each refresh issues a new token. Reusing an old token revokes the whole session family |
| Account lockout | Done | 5 failed attempts lock the account for 15 minutes; both events are audit-logged |
| Forced password change | Done | Accounts created with a temporary password must change it before use |
| Roles and permissions (RBAC) | Done | Five roles, editable role→permission matrix, per-user grant/revoke overrides |
| Backend enforcement | Done | Every route is authenticated by default. Permissions are checked on the server |
| User management | Done | List, search, filter, create, change role, suspend and reactivate, permission overrides |
| Role assignment rules | Done | Only Super Admins can create or promote Admins. Admins cannot modify Admin or Super Admin accounts |
| Dashboard (Admin / Super Admin) | Done | Real counts from the database and a recent security activity feed |
| Dashboard (other roles) | Done | Shows personal context and the modules this role will get, with phases |
| Audit log | Done (write side) | Every security-relevant action is recorded. The viewer page is Phase 1b |
| English / Sinhala UI | Partial | Language switch works. Sinhala strings are a first draft and need native-speaker review |
| Light / dark theme | Done | Follows the system setting by default and can be overridden |
| Projects, tasks, sprints, clients | Schema only | Phase 2 |
| Time tracker, activity monitor, attendance, leave | Schema only | Phase 3 |
| Chat, meetings, notifications | Schema only | Phase 4 |
| Documents, bugs, Git integration | Schema only | Phase 5 |
| Reports, internship management | Schema only | Phase 6 |
| Security testing and deployment hardening | Not started | Phase 7 |

### Not yet built (be aware before going live)

- **Two-factor authentication:** the schema has the fields, but no enrolment or verification flow exists.
- **Forgot password / email verification:** these need an email provider. Until then, administrators create accounts and share temporary passwords.
- **Socket.IO real-time updates:** the notification engine is Phase 4.
- **Redis:** the container runs, but Phase 1 code does not use it yet.
- **Object storage (S3):** file uploads are not implemented. The schema stores storage keys only.
- **Content Security Policy:** the basic security headers are set. A strict CSP with nonces is part of Phase 7.
- **Automated end-to-end browser tests:** planned for Phase 7.

## Quick start (Docker)

Requirements: Docker 24+ with Compose v2.

```bash
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD and JWT_ACCESS_SECRET (use long random values).

docker compose up -d --build postgres redis api
```

**First run only: create the database schema.** This repository intentionally ships without generated migration
files, because a migration must be produced against a database you control. Run this once, then commit the
generated `apps/api/prisma/migrations` folder:

```bash
cd apps/api
npm install
DATABASE_URL="postgresql://projectflow:<your-password>@localhost:5432/projectflow?schema=public" \
  npx prisma migrate dev --name init
```

(Start the database first with `docker compose up -d postgres`. Its port 5432 is bound to `127.0.0.1` only, for this step.)

After the migration exists, the API container runs `prisma migrate deploy` automatically on every start.

Then build the web app and load the development accounts:

```bash
docker compose up -d --build web
docker compose --profile tools run --rm seed      # development only
```

Open **http://localhost:3000**.

### Development accounts (created by the seed script only)

All use the password in `SEED_PASSWORD`. Change or delete these accounts before any real use.

| Email | Role |
|---|---|
| superadmin@yakunex.lk | Super Admin |
| admin@yakunex.lk | Admin |
| pm@yakunex.lk | Project Manager |
| dev@yakunex.lk | Staff / Developer |
| intern@yakunex.lk | Intern |

## Local development without Docker

```bash
# Terminal 1 – API (needs Node 20+ and a running PostgreSQL)
cd apps/api
npm install
export DATABASE_URL="postgresql://projectflow:<password>@localhost:5432/projectflow?schema=public"
export JWT_ACCESS_SECRET="$(openssl rand -base64 48)"
export WEB_ORIGIN="http://localhost:3000"
npx prisma generate
npx prisma migrate dev --name init          # first time only
SEED_PASSWORD='ChangeMe!2026' npm run seed  # development only
npm run start:dev

# Terminal 2 – web
cd apps/web
npm install
npm run dev                                 # http://localhost:3000 (proxies /api to :4000)
```

## Tests

```bash
cd apps/api
npm test          # RBAC resolution, role-assignment rules, permission catalogue
npm run typecheck
cd ../web
npm run typecheck
```

## Architecture

```
projectflow/
├── apps/
│   ├── api/                     NestJS 10 · Prisma 5 · PostgreSQL 16
│   │   ├── prisma/schema.prisma 45 models covering every table in the specification
│   │   ├── prisma/seed.ts       Development data (refuses to run in production)
│   │   └── src/
│   │       ├── auth/            Login, lockout, refresh rotation, JWT guard, password change
│   │       ├── rbac/            Permission catalogue, role defaults, effective-permission resolver, guard
│   │       ├── users/           User management and role-assignment rules
│   │       ├── dashboard/       Role-based summaries computed from the database
│   │       ├── audit/           Append-only audit writer
│   │       └── health/          Liveness and database check
│   └── web/                     Next.js 15 (App Router) · React 19 · Tailwind CSS 3
│       └── src/
│           ├── app/             Routes: login, dashboard, users, planned-module placeholders
│           ├── components/      Shell (sidebar, top bar), UI primitives, providers
│           └── lib/             API client with silent refresh, navigation, translations
├── docker-compose.yml           postgres · redis · api · web · seed (tools profile)
└── .env.example
```

### Security model

- **Authentication:** Argon2id hashes. The access token (15 min) and refresh token (7 days) are set as
  HttpOnly cookies. The refresh cookie is scoped to `/api/auth`. Cookies are `Secure` in production
  and `SameSite=Lax`.
- **Sessions:** refresh tokens are stored as SHA-256 hashes. Reuse of a rotated token revokes the whole
  family. Suspending or deactivating an account revokes its sessions immediately. Changing a password
  signs out every device.
- **Every request is re-checked:** the guard reloads the user from the database on each call, so a
  suspended account loses access at once.
- **Authorisation:** routes are closed by default (`@Public()` is the only exception). Permissions are
  checked on the server. The React UI reads the same permission list only to hide controls.
- **Privilege escalation guard:** a user can grant only permissions they already hold. Super Admin
  accounts can be changed only by other Super Admins.
- **Tenant isolation:** every query filters by the caller's `organizationId` taken from the verified
  token, not from the request.
- **Input validation:** a global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`. Unknown
  fields are rejected.
- **Rate limiting:** login is limited to 10 requests per minute per IP. The global limit is 300 per minute.
- **Headers and origin:** Helmet on the API. `X-Frame-Options`, `nosniff`, `Referrer-Policy` on the web.
  CORS allows only the origins in `WEB_ORIGIN`.
- **Secrets:** read from environment variables. The API refuses to start if `JWT_ACCESS_SECRET` is
  missing or shorter than 32 characters. No secrets are placed in client code.
- **Temporary passwords:** generated with `crypto.randomBytes`, shown once in the admin UI, and never
  logged or stored in plain text.

### Activity monitoring (Phase 3 design, not yet implemented)

Per the specification, only timestamps and Active/Idle/Paused/Offline intervals will be stored. Keystrokes,
raw pointer coordinates, and screenshots will not be recorded. A browser cannot observe other desktop
applications, so system-wide tracking would need a separately installed, opt-in desktop agent. Mouse movement
alone will never be treated as proof of productivity.

## Integrations that need external accounts or paid services

These are not built yet. Each one needs an account or credentials from you before work starts.

| Integration | What you need to provide |
|---|---|
| Video meetings | Zoom Server-to-Server OAuth app (Zoom Pro or higher) **or** a self-hosted Jitsi domain. The Jitsi option needs no paid account |
| File storage | AWS S3 bucket (or any S3-compatible store) with IAM credentials limited to one bucket |
| Email (verification, reset, notifications) | SMTP credentials or a transactional email provider (e.g. SES, Postmark) |
| GitHub | A GitHub App with webhook secret, installed on your organisation |
| GitLab | A GitLab application or project access token, and a webhook secret |
| Error monitoring | Sentry DSN (optional) |

Credentials are stored in your secrets manager and referenced by ID in the database. They are never
written to the database or the frontend.

## Roadmap

Delivery follows the phases in the specification. Each phase is complete only when its tests pass.

1. **Phase 1 (done):** authentication, RBAC, dashboard, user management.
2. **Phase 2:** projects, tasks, sprints, clients, Kanban/list/timeline views, progress calculation.
3. **Phase 3:** time tracker with single-running-timer guarantee (database partial index in
   `prisma/migrations/manual/001_single_running_timer.sql`), attendance, leave, and activity heartbeat.
4. **Phase 4:** chat, meetings, notifications, and the Socket.IO gateway.
5. **Phase 5:** documents, bug tracking and QA workflow, Git integration.
6. **Phase 6:** reports and exports (PDF, CSV, XLSX), internship management.
7. **Phase 7:** security testing, integration testing, deployment hardening.

Smart features from the specification (workload view, deadline risk alerts, blocker alerts, daily summaries,
project health score, and the AI assistant) build on Phases 2–4 data and are scheduled after Phase 4.

## Language notes

The Sinhala translations in `apps/web/src/lib/i18n.ts` are a first draft. Have a native speaker review
them before release. Missing keys fall back to English.

## Licence

Proprietary. © Yakunex Technologies (Pvt) Ltd.
