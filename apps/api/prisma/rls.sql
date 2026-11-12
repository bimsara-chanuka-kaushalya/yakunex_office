-- =============================================================================
-- Yakunex Hub — Enterprise PostgreSQL & Supabase Row Level Security (RLS)
-- Prevents any unauthorized PostgREST / anon / cross-tenant / cross-user leak
-- =============================================================================

-- 1. Lock down public schema privileges from anonymous / unauthenticated roles
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, PUBLIC;

-- 2. Enable Row Level Security (RLS) on every table in the public schema
DO $$
DECLARE
  tbl RECORD;
  has_org_id BOOLEAN;
  has_user_id BOOLEAN;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    -- Enable RLS on table
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);

    -- Policy 1: Full access for trusted backend service role / postgres pooler
    EXECUTE format('DROP POLICY IF EXISTS "backend_service_full_access" ON public.%I;', tbl.tablename);
    EXECUTE format(
      'CREATE POLICY "backend_service_full_access" ON public.%I FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);',
      tbl.tablename
    );

    -- Check if table has organizationId column for multi-tenant isolation
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl.tablename AND column_name = 'organizationId'
    ) INTO has_org_id;

    -- Check if table has userId column for per-user isolation
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl.tablename AND column_name = 'userId'
    ) INTO has_user_id;

    -- Policy 2: Organization-level tenant isolation for authenticated JWTs
    IF has_org_id THEN
      EXECUTE format('DROP POLICY IF EXISTS "org_tenant_isolation_policy" ON public.%I;', tbl.tablename);
      EXECUTE format(
        'CREATE POLICY "org_tenant_isolation_policy" ON public.%I FOR SELECT TO authenticated USING ((current_setting(''request.jwt.claims'', true)::jsonb ->> ''org'') = "organizationId"::text);',
        tbl.tablename
      );
    END IF;

    -- Policy 3: User-level self-isolation on personal/sensitive tables
    IF tbl.tablename IN ('RefreshToken', 'UserPermission', 'TimeEntry', 'Attendance', 'LeaveRequest', 'Notification') AND has_user_id THEN
      EXECUTE format('DROP POLICY IF EXISTS "user_self_isolation_policy" ON public.%I;', tbl.tablename);
      EXECUTE format(
        'CREATE POLICY "user_self_isolation_policy" ON public.%I FOR ALL TO authenticated USING ((current_setting(''request.jwt.claims'', true)::jsonb ->> ''sub'') = "userId"::text) WITH CHECK ((current_setting(''request.jwt.claims'', true)::jsonb ->> ''sub'') = "userId"::text);',
        tbl.tablename
      );
    ELSIF tbl.tablename = 'User' THEN
      EXECUTE format('DROP POLICY IF EXISTS "user_self_read_policy" ON public.%I;', tbl.tablename);
      EXECUTE format(
        'CREATE POLICY "user_self_read_policy" ON public.%I FOR SELECT TO authenticated USING ((current_setting(''request.jwt.claims'', true)::jsonb ->> ''sub'') = "id"::text);',
        tbl.tablename
      );
    END IF;
  END LOOP;
END
$$;
