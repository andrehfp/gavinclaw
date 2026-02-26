CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  org_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  hash TEXT NOT NULL,
  prev_hash TEXT
);

CREATE INDEX IF NOT EXISTS audit_events_ts_idx ON audit_events (ts DESC);
CREATE INDEX IF NOT EXISTS audit_events_org_ts_idx ON audit_events (org_id, ts DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_ts_idx ON audit_events (actor_id, ts DESC);

CREATE OR REPLACE FUNCTION audit_events_hash_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  previous_hash TEXT;
  payload_text TEXT;
BEGIN
  IF NEW.ts IS NULL THEN
    NEW.ts := NOW();
  END IF;

  SELECT hash INTO previous_hash
  FROM audit_events
  ORDER BY ts DESC, id DESC
  LIMIT 1
  FOR UPDATE;

  NEW.prev_hash := previous_hash;
  payload_text := COALESCE(NEW.payload_json::text, '{}');

  NEW.hash := ENCODE(
    DIGEST(
      COALESCE(previous_hash, '') || '|' ||
      NEW.ts::text || '|' ||
      NEW.org_id || '|' ||
      NEW.actor_id || '|' ||
      NEW.action || '|' ||
      NEW.resource || '|' ||
      payload_text,
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_events_hash_trigger ON audit_events;
CREATE TRIGGER audit_events_hash_trigger
BEFORE INSERT ON audit_events
FOR EACH ROW
EXECUTE FUNCTION audit_events_hash_before_insert();

CREATE OR REPLACE FUNCTION audit_events_prevent_update_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only_trigger ON audit_events;
CREATE TRIGGER audit_events_append_only_trigger
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION audit_events_prevent_update_delete();
