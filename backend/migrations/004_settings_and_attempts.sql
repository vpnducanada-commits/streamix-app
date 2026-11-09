-- Streamix — clé HMAC côté base + limitation des tentatives.
-- Additive, réexécutable, sans effet sur Better Auth.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS streamix.settings (
  key text PRIMARY KEY,
  value bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- La clé est générée par la base : elle ne transite jamais par un navigateur,
-- un message ou un dépôt de code.
INSERT INTO streamix.settings (key, value)
VALUES ('code_hmac_key', gen_random_bytes(32))
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS streamix.attempts (
  id bigserial PRIMARY KEY,
  ip_digest bytea NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  accepted boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS streamix_attempts_window_idx
  ON streamix.attempts (ip_digest, attempted_at DESC);

CREATE OR REPLACE FUNCTION streamix.record_attempt(p_ip_digest bytea, p_accepted boolean, p_limit integer DEFAULT 20)
RETURNS text
LANGUAGE plpgsql
SET search_path = pg_catalog, streamix
AS $$
DECLARE
  recent integer;
BEGIN
  SELECT count(*) INTO recent FROM streamix.attempts
    WHERE ip_digest = p_ip_digest AND attempted_at > now() - interval '10 minutes';
  IF recent >= p_limit THEN
    INSERT INTO streamix.attempts (ip_digest, attempted_at, accepted) VALUES (p_ip_digest, now(), false);
    RETURN 'rate_limited';
  END IF;
  INSERT INTO streamix.attempts (ip_digest, attempted_at, accepted) VALUES (p_ip_digest, now(), p_accepted);
  RETURN 'recorded';
END;
$$;

CREATE OR REPLACE FUNCTION streamix.purge_attempts()
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, streamix
AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM streamix.attempts WHERE attempted_at < now() - interval '30 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON streamix.settings FROM PUBLIC;
REVOKE ALL ON streamix.attempts FROM PUBLIC;
REVOKE ALL ON FUNCTION streamix.record_attempt(bytea, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION streamix.purge_attempts() FROM PUBLIC;

COMMIT;
