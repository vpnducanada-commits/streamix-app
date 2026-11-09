-- Streamix — vérification fonctionnelle de la base (Neon SQL Editor).
-- Rien n'est conservé : le script se termine par ROLLBACK.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS streamix.settings (
  key text PRIMARY KEY,
  value bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Clé HMAC générée par la base elle-même : aucune clé secrète ne transite par le chat.
INSERT INTO streamix.settings (key, value)
VALUES ('code_hmac_key', gen_random_bytes(32))
ON CONFLICT (key) DO NOTHING;

REVOKE ALL ON streamix.settings FROM PUBLIC;

-- Codes et appareils de test, uniquement dans cette transaction.
-- Le code expiré est créé antidaté (créé il y a 2 h, expiré il y a 1 h) :
-- la contrainte d'expiration reste respectée.
INSERT INTO streamix.access_codes (id, code_digest, label, created_at, expires_at, max_devices)
VALUES
  ('00000000-0000-4000-8000-000000000001', decode(repeat('11', 32), 'hex'), 'test valide',
   now(), now() + interval '1 day', 2),
  ('00000000-0000-4000-8000-000000000002', decode(repeat('22', 32), 'hex'), 'test expiré',
   now() - interval '2 hours', now() - interval '1 hour', 5),
  ('00000000-0000-4000-8000-000000000003', decode(repeat('33', 32), 'hex'), 'test révoqué',
   now(), now() + interval '1 day', 5);

UPDATE streamix.access_codes SET revoked_at = now()
  WHERE id = '00000000-0000-4000-8000-000000000003';

-- 1) premier appareil : doit être accepté
SELECT 'appareil A — 1re connexion' AS etape, result, valid_until
FROM streamix.claim_device(decode(repeat('11', 32), 'hex'), decode(repeat('a1', 32), 'hex'));

-- 2) même appareil : doit rester accepté et ne pas consommer de place
SELECT 'appareil A — 2e connexion' AS etape, result, valid_until
FROM streamix.claim_device(decode(repeat('11', 32), 'hex'), decode(repeat('a1', 32), 'hex'));

-- 3) deuxième appareil : doit être accepté (limite = 2)
SELECT 'appareil B — 1re connexion' AS etape, result, valid_until
FROM streamix.claim_device(decode(repeat('11', 32), 'hex'), decode(repeat('b2', 32), 'hex'));

-- 4) troisième appareil : doit être REFUSÉ avec device_limit
SELECT 'appareil C — limite atteinte' AS etape, result, valid_until
FROM streamix.claim_device(decode(repeat('11', 32), 'hex'), decode(repeat('c3', 32), 'hex'));

-- 5) code expiré : doit répondre expired
SELECT 'code expiré' AS etape, result, valid_until
FROM streamix.claim_device(decode(repeat('22', 32), 'hex'), decode(repeat('d4', 32), 'hex'));

-- 6) code révoqué : doit répondre invalid
SELECT 'code révoqué' AS etape, result, valid_until
FROM streamix.claim_device(decode(repeat('33', 32), 'hex'), decode(repeat('e5', 32), 'hex'));

-- 7) code inexistant : doit répondre invalid
SELECT 'code inexistant' AS etape, result, valid_until
FROM streamix.claim_device(decode(repeat('99', 32), 'hex'), decode(repeat('f6', 32), 'hex'));

-- 8) la clé HMAC existe bien et fait 32 octets
SELECT 'clé HMAC' AS etape, count(*) AS presente, min(length(value)) AS octets
FROM streamix.settings WHERE key = 'code_hmac_key';

ROLLBACK;
