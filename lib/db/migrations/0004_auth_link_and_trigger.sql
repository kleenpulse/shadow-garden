-- Link public.profiles to Supabase's auth.users and auto-create a profile on
-- signup. Drizzle can't express either because it doesn't manage the `auth`
-- schema. RLS needs no statements here: 0002 covered the anonymous tables and
-- 0003 created profiles/entitlements with RLS already enabled.

-- 1. profiles.id is the auth user id. FK with cascade so deleting an auth user
--    tears down their profile (and, via existing cascades, entitlements).
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_auth_users_id_fk"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- 2. Auto-provision a profile row whenever Supabase Auth creates a user.
--    SECURITY DEFINER so the trigger can write to public.profiles regardless of the
--    calling role. Set search_path explicitly (hardening against search_path attacks).
CREATE OR REPLACE FUNCTION "public"."handle_new_user"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'user_name', NEW.raw_user_meta_data ->> 'full_name')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";
--> statement-breakpoint
CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();
