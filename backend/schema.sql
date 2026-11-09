-- Streamix secure backend schema. Apply only to the dedicated Streamix Neon database.
-- This migration is additive and does not import or modify legacy device-local codes.
-- Access through a trusted server only; never expose the database credentials in the app.
BEGIN;

CREATE SCHEMA IF NOT EXISTS streamix;

CREATE TABLE IF NOT EXISTS streamix.access_codes (
  id uuid PRIMARY KEY,
  code_digest bytea NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  max_devices integer CHECK (max_devices IS NULL OR max_devices BETWEEN 1 AND 10000),
  revoked_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS streamix.code_devices (
  code_id uuid NOT NULL REFERENCES streamix.access_codes(id) ON DELETE CASCADE,
  device_digest bytea NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (code_id, device_digest)
);

CREATE INDEX IF NOT EXISTS streamix_devices_active_idx
  ON streamix.code_devices (code_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS streamix_codes_created_idx
  ON streamix.access_codes (created_at DESC);

-- A singleton release record; updates are announced only when an authenticated
-- administrator publishes a vetted HTTPS download URL.
CREATE TABLE IF NOT EXISTS streamix.releases (
  version_code integer PRIMARY KEY CHECK (version_code > 0),
  version_name text NOT NULL,
  download_url text NOT NULL CHECK (download_url LIKE 'https://%'),
  published_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL DEFAULT ''
);

-- The server must supply HMAC digests, never plaintext codes or device IDs.
-- Row locking serializes simultaneous claims and prevents two devices from
-- racing past the limit. Rate limiting is additionally required at the API.
CREATE OR REPLACE FUNCTION streamix.claim_device(p_code_digest bytea, p_device_digest bytea)
RETURNS TABLE(result text, valid_until timestamptz)
LANGUAGE plpgsql
SET search_path = pg_catalog, streamix
AS $$
DECLARE
  item streamix.access_codes%ROWTYPE;
  active_count bigint;
  known boolean;
BEGIN
  SELECT * INTO item FROM streamix.access_codes WHERE code_digest = p_code_digest FOR UPDATE;
  IF NOT FOUND OR item.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::timestamptz; RETURN;
  END IF;
  IF item.expires_at IS NOT NULL AND item.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, item.expires_at; RETURN;
  END IF;
  SELECT EXISTS (SELECT 1 FROM streamix.code_devices
    WHERE code_id = item.id AND device_digest = p_device_digest AND revoked_at IS NULL)
    INTO known;
  IF NOT known THEN
    SELECT count(*) INTO active_count FROM streamix.code_devices
      WHERE code_id = item.id AND revoked_at IS NULL;
    IF item.max_devices IS NOT NULL AND active_count >= item.max_devices THEN
      RETURN QUERY SELECT 'device_limit'::text, item.expires_at; RETURN;
    END IF;
  END IF;
  INSERT INTO streamix.code_devices (code_id, device_digest)
    VALUES (item.id, p_device_digest)
    ON CONFLICT (code_id, device_digest) DO UPDATE SET last_seen = now(), revoked_at = NULL;
  RETURN QUERY SELECT 'ok'::text, item.expires_at;
END;
$$;
REVOKE ALL ON SCHEMA streamix FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA streamix FROM PUBLIC;
REVOKE ALL ON FUNCTION streamix.claim_device(bytea, bytea) FROM PUBLIC;

COMMIT;
