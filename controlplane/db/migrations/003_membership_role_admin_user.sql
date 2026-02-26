DO $$
DECLARE
  enum_values TEXT[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_role') THEN
    CREATE TYPE membership_role AS ENUM ('admin', 'user');
    RETURN;
  END IF;

  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
  INTO enum_values
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typname = 'membership_role';

  IF enum_values = ARRAY['admin', 'user'] THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_role_v2') THEN
    DROP TYPE membership_role_v2;
  END IF;

  CREATE TYPE membership_role_v2 AS ENUM ('admin', 'user');

  ALTER TABLE memberships
    ALTER COLUMN role TYPE membership_role_v2
    USING (
      CASE role::text
        WHEN 'owner' THEN 'admin'
        WHEN 'admin' THEN 'admin'
        WHEN 'analyst' THEN 'user'
        WHEN 'viewer' THEN 'user'
        WHEN 'user' THEN 'user'
        ELSE role::text
      END
    )::membership_role_v2;

  DROP TYPE membership_role;
  ALTER TYPE membership_role_v2 RENAME TO membership_role;
END$$;
