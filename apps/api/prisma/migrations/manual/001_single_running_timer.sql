-- Enforces at most one running timer per user at the database level.
-- Run after the initial Prisma migration (Phase 3). Prisma cannot express partial unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_running_timer_per_user
  ON "TimeEntry" ("userId")
  WHERE "endedAt" IS NULL;
