# Streamix — état au 2026-11-08

## En ligne (production)
- Tableau de bord : https://streamix-app.vercel.app/admin.html
- Accueil : https://streamix-app.vercel.app/
- Déploiement : dpl_13uTsK8axp1cadZYkEyAx5TQ4p4W (READY, alias production)

## API (une seule fonction : `api/[...all].js`)
| Route | Méthode | Rôle |
|---|---|---|
| `/api/health` | GET | 5 tables streamix, clé HMAC 32 octets |
| `/api/redeem` | POST | `{code, deviceId}` → destination + validUntil |
| `/api/release` | GET | dernière version publiée (ou `null`) |
| `/api/session` | GET | session Better Auth (proxy) |
| `/api/signin` / `/api/signup` / `/api/signout` | POST | proxy Better Auth |
| `/api/codes` | GET / POST | liste / création |
| `/api/codes?id=<uuid>` | GET / PATCH | appareils / `{revoked}` |
| `/api/codes?id=<uuid>&device=<12 hex>` | DELETE | libérer un slot |
| `/api/publish` | POST | publier une version |

Important : le catch-all Vercel ne route **qu'un seul segment** — d'où les routes à plat
(`/api/codes?id=` au lieu de `/api/admin/codes/:id`).

## Auth
`NEON_AUTH_BASE_URL` + `STREAMIX_ADMIN_EMAIL=vpnducanada@gmail.com,admin@streamix.app` (liste séparée par des virgules).
Le compte `vpnducanada@gmail.com` existe déjà mais son mot de passe est inconnu ; le compte
`admin@streamix.app` a été créé pour garantir l'accès (mot de passe communiqué hors dépôt).
Le proxy renvoie l'en-tête `Origin` du domaine Neon Auth (sinon `INVALID_ORIGIN`) et
réémet les cookies sur notre domaine (`Path=/; HttpOnly; Secure; SameSite=Lax`).

## Vérifié en production
- `POST /api/redeem` code inconnu → 404 `invalid` ; GET → 405.
- `/api/codes` sans session → 401 ; avec session non-admin → 403 `not_administrator`.
- Compte de test `streamix.test.0001@example.com` créé (non admin, inoffensif).
- Connexion Better Auth acceptée ; mot de passe erroné → 401 `INVALID_EMAIL_OR_PASSWORD`.

## À faire ensuite
1. Se connecter sur `/admin.html` avec `vpnducanada@gmail.com`
   (sinon bouton « Créer ce compte »).
2. Créer un premier vrai code.
3. Reconstruire l'APK pour qu'il appelle l'API et lire `GET /api/release`.
