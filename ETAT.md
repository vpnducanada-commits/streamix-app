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

## Journal des correctifs
- 2026-11-08 : le code était refusé à la validation (empreinte calculée en majuscules côté
  `redeem`, en minuscules côté création). `normalizeCode` renvoie désormais des minuscules ;
  test de non-régression ajouté (12/12). Vérifié en production : appareil A 200, A bis 200,
  B 200, C 403 `device_limit`, code minuscule/sans tirets 200, code inconnu 404.

## 2026-11-08 — v7 native : app branchée sur le serveur

- `www/app.js` ne contient plus aucun secret : validation par `POST /api/redeem` (`deviceId` base64url 43 car.), destination et `validUntil` lus depuis la réponse, bannière de mise à jour via `GET /api/release`.
- `MainActivity.java` : `setAllowFileAccessFromFileURLs` + `setAllowUniversalAccessFromFileURLs(true)` (le `file://` local peut appeler l'API HTTPS).
- `app/build.gradle` : `versionCode 7`, `versionName "7.0"` — même certificat debug que la v6 (mise à jour sans désinstallation).
- Release servie : `GET /api/release` → `{versionCode:7, versionName:"7.0", downloadUrl: Drive}` ; les v6 voient la bannière.
- APK : https://drive.google.com/file/d/1a0f76OcC4GGTGgTrtPMOpiWMo3XzciNG/view (public, 3 513 236 o).
