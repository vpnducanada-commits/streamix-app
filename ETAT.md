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

## 2026-11-08 — v9/v10 natives

- **Barre de recherche supprimée définitivement** : plus de `topBar` dans `activity_main.xml`, plus de `urlInput`/`goBtn`/`lockBtn`/geste à deux doigts dans le code natif, plus de `#topBar` dans la coque web (`www/index.html`). Retour à l'écran de code par le bouton Retour Android.
- **Site en plein écran** : la bande de marque native de 56 dp est retirée, le WebView occupe tout l'écran, la barre de progression est superposée en haut (3 dp).
- **Vidéo plein écran** : `WebChromeClient.onShowCustomView`/`onHideCustomView` implémentés avec `fullscreenContainer`, mode immersif, rotation libre (`SCREEN_ORIENTATION_SENSOR`), `FLAG_KEEP_SCREEN_ON`, `configChanges` élargi (pas de recréation d'activité en tournant le téléphone).
- **Notifications** : permission `POST_NOTIFICATIONS` demandée au lancement (Android 13+), canal `streamix_rappels`, rappel quotidien « C'est l'heure du visionnage » à 20:00 via AlarmManager (`setAndAllowWhileIdle`, sans permission d'alarme exacte), reprogrammé par `ReminderReceiver` et `BootReceiver`.
- APK v10 : `versionCode 10`, 3 515 154 o, certificat identique (v4→v10).

## 2026-11-08 — v11

- **Bande de marque rétablie** en haut (56 dp, logo centré) sur les pages du site, **masquée pendant la lecture plein écran** (`updateSiteChrome(url)` + `enterFullscreen`).
- **Filigrane Streamix en bas à gauche** (cadre translucent `bg_watermark`), superposé au site, sans capter les touchers.
- **Voile latéral léger** (24 dp de chaque côté, dégradé rouge 18 % → transparent) sur toutes les pages après validation, jamais sur l'écran de code ; version web identique via `.browser-view::before/::after`.
- **Rappel toutes les 5 h** : créneaux fixes 00h, 05h, 10h, 15h, 20h (heure locale), `ReminderScheduler.INTERVAL_HOURS = 5`.
- APK v11 : `versionCode 11`, 3 516 949 o, même certificat.

## 2026-11-08 — v12

- **Créneaux de rappel** : 20 h et 2 h (heure locale) au lieu du pas de 5 h — `ReminderScheduler.SLOT_HOURS = {20, 2}`.
- **Son de notification personnalisé** : `res/raw/streamix_chime.wav` (carillon 2 notes C6→E6, 1,75 s), canal `streamix_rappels_v2` (identifiant neuf, car Android fige le son d'un canal), ancien canal `streamix_rappels` supprimé, `setSound` conservé pour Android 7.
- APK v12 : `versionCode 12`, 3 672 393 o, même certificat.

## 2026-11-08 — v13

- **Son de notification = son par défaut de l'appareil** de chaque utilisateur (`Settings.System.DEFAULT_NOTIFICATION_URI`).
- Canal `streamix_rappels_v3` ; anciens canaux `streamix_rappels` et `streamix_rappels_v2` supprimés au lancement (Android fige le son d'un canal existant).
- `res/raw/streamix_chime.wav` retiré de l'APK (-154 Ko).
- Créneaux inchangés : 20 h et 2 h.
- APK v13 : `versionCode 13`, 3 517 517 o, même certificat.

## 2026-11-08 — nettoyage Drive

- 10 anciens APK déplacés à la corbeille : Streamix.apk, Streamix-natif(.apk, v3→v8, v10→v12).
- Permission `anyoneWithLink` supprimée sur v7, v8, v10, v11, v12 (`make_private` ne suffisait pas : la permission restait active sur les fichiers en corbeille, `delete_permission` a été nécessaire).
- Vérifié : les 10 anciens liens renvoient une page d'erreur HTML, seul **v13** (`1H8lkzgGuwmQmjwVrBZVimY9EqVjLR9Q6`) reste téléchargeable.
- Copies locales conservées dans `/home/user/` (v4→v13).
