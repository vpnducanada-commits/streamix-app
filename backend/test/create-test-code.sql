-- Streamix — création d'UN code de test temporaire (à supprimer juste après).
-- Le code de test est : A1B2-C3D4-E5F6-0718-293A-4B5C-6D7E-8F90
-- Il expire dans 2 heures et accepte 2 appareils.
-- La signature est calculée par la base à partir de la clé secrète déjà stockée.
INSERT INTO streamix.access_codes (id, code_digest, label, expires_at, max_devices)
SELECT
  gen_random_uuid(),
  hmac(
    convert_to('code', 'UTF8') || decode('00', 'hex') ||
    convert_to(upper(replace('A1B2-C3D4-E5F6-0718-293A-4B5C-6D7E-8F90', '-', '')), 'UTF8'),
    (SELECT value FROM streamix.settings WHERE key = 'code_hmac_key'),
    'sha256'
  ),
  'test API temporaire',
  now() + interval '2 hours',
  2
RETURNING id, label, expires_at, max_devices;
