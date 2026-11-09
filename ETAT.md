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

## 2026-11-08 — v14 : couche d'animation complète

- **Nouvelle couche web** `www/motion.css` + `www/motion.js` (objet global `window.MOTION`), chargée avant `app.js`.
- **Splash d'ouverture** : logo Streamix qui apparaît puis pulse, ligne de lumière horizontale, texte « STREAMIX » en fondu. Disparaît de lui-même.
- **Transitions d'écran** : après validation du code, rideau avec halo tournant et « Préparation de ton catalogue… » ; l'écran de code se retire (fondu + montée de 380 ms) et le navigateur arrive en zoom-fondu (`#browserView.browser-in`).
- **Micro-interactions** : ripple au toucher sur tous les boutons, effet d'enfoncement, bouton « Valider » en état de chargement (spinner), secousse + halo rouge sur code refusé ou vide, coche verte animée sur succès.
- **Apparition en cascade** : `.logo-area`, `.code-card`, `.admin-access-link`, `.whatsapp-buy` arrivent l'un après l'autre (`data-enter`). Listes (modales, panneau admin, utilisateurs) : chaque ligne apparaît en décalage de 45 ms (`--d`).
- **Modales** : ouverture avec `.open` + contenu en stagger, fermeture animée.
- **Toasts** : apparition glissée + sortie en fondu.
- **Natif (`MainActivity.java`)** : fondu de page à chaque navigation WebView (alpha 0.15 → 1, garde anti-clignotement 1,4 s), barre de progression adoucie (fondu entrée/sortie), bande de marque qui glisse (−18 dp → 0), plein écran vidéo en fondu (`fullscreenContainer` alpha 0 → 1).
- **Accessibilité** : toutes les animations sont désactivées sous `prefers-reduced-motion: reduce`.
- APK v14 : `versionCode 14`, `versionName "14.0"`, 3 525 626 o, même certificat (mise à jour par-dessus la v13 sans désinstallation).
- Release publiée : `POST /api/publish` → `{"published":14}` ; `GET /api/release` renvoie v14.
- **Visuels UHD régénérés** avec le QR de la v14 (QR vérifié par décodage sur les fichiers re-téléchargés depuis Drive) : vertical 2160×3836 (`1vIXCFn0zWBHcTFhR8juR_-Od4Xh5l1nt`), carré 2160×2160 (`1V2liC63dbj8aY0ue2g-aMX9bUJPmtLwb`). Les anciens visuels (QR v13) et les affiches de test sont à la corbeille, accès public révoqué.
- Drive ne contient plus qu'**un seul APK téléchargeable** : `Streamix-natif-v14.apk` (`1kRsv_UUAYwo95JuF1QikFsjkUs5NuP6o`).

## 2026-11-09 — v15 : audit complet et correctifs

**Bug bloquant signalé par l'utilisateur** : sur l'écran de code, la carte du code (champ + bouton ENTRER + « Code oublié ? ») était totalement invisible — on ne voyait que le logo, « Administration » et le bouton WhatsApp.

- **Cause** : `style.css` impose `animation:none !important` à `#lockScreen .shimmer-card`. La révélation `[data-enter]` reposait sur une animation CSS : annulée, l'élément restait figé à `opacity:0` (état initial) sans jamais redevenir visible.
- **Correction** : la révélation passe par des **transitions** (`html.mo [data-enter]`), insensibles à `animation:none`. Trois filets de sécurité :
  1. la classe `mo` n'est posée que si `motion.js` démarre (sans JS, tout est visible) ;
  2. `guard()` force la sortie du splash et l'affichage après 3 s ;
  3. un script inline retire `mo` si `MOTION` n'existe pas au bout de 2,5 s + règle `html.enter-done` en `!important`.
- **Version** : `APP_VERSION_CODE` figé à 13 → la bannière « Mise à jour 14.0 » s'affichait même sur la v14. La coque native transmet maintenant la vraie version (`index.html?v=<versionCode>`), le repli navigateur vaut 15.
- **Retour depuis le site** : après un retour arrière, la session restaurée laissait un navigateur vide (écran noir). La session restaure désormais aussi le chargement du catalogue (`loadUrl` + surveillance d'expiration).
- **`watcher`** déclaré avant le bloc de restauration (la zone morte temporelle de `let` faisait planter le script au retour).
- **« Code oublié ? »** : impasse (« Utilise le tableau de bord en ligne ») remplacée par un accès WhatsApp prérempli ; l'ancienne question secrète locale est retirée de l'interface.
- **Mise en page** : placeholder du champ en Inter (l'espacement monospace le rendait illisible), `letter-spacing` réduit, prénoms animés cantonnés aux marges (ils passaient sur le logo et la carte), marge basse quand la bannière de mise à jour est présente.
- **Accessibilité** : `aria-label` sur le champ, `role="status" aria-live` sur les erreurs, `autocapitalize/autocorrect/enterkeyhint`, `color-scheme:dark`, polices Google chargées en non bloquant (aucun écran blanc si le réseau est lent).
- **Natif** :
  - build **release** (et non plus debug) signé avec le même certificat → `debuggable=false`, APK 2,87 Mo au lieu de 3,53 ;
  - `usesCleartextTraffic="false"` (tout est en HTTPS) ;
  - liens sortants élargis : WhatsApp (`wa.me`, `api.whatsapp.com`, `whatsapp://`), `tel:`, `sms:`, `mailto:` ;
  - barre de progression jamais affichée sur la page locale ;
  - `onRenderProcessGone` : redémarrage propre si le moteur WebView est tué.
- **Tests automatisés** (Chromium headless + serveur réel, 26 vérifications) : carte visible sur 320×568 → 768×1024 et en paysage, aucun débordement horizontal, erreurs « code vide »/« code refusé », modale, rideau, ouverture du navigateur, session mémorisée, retour sans écran noir, bannière de mise à jour (affichée si version supérieure, absente sinon), `prefers-reduced-motion`.
- **Bout en bout réel** : page `file://` (comme le WebView) + code de test `79F0-…-E973` → `HTTP 200` → rideau → navigation vers `https://vod.talis.top/` (« Répertoire · TopStream »), aucune erreur JS.
- APK v15 : `versionCode 15`, `versionName "15.0"`, 2 865 131 o, certificat identique (`6876c20d…`), sha256 `b3324673…`.
- Release publiée : `POST /api/publish` → `{"published":15}` ; `GET /api/release` renvoie v15.
- Visuels UHD régénérés avec le QR de la v15 (décodage vérifié après re-téléchargement) : vertical `1ymfoZnwf4KLsQx-_d8coE3Fi2_0b3Pw4`, carré `1TDVwI0ppdTn2QcYYEGuCm77NjuHjAQF3`.
- Drive ne contient plus qu'un seul APK téléchargeable (`1d45M-jGFKWNkcsip-eT0ZrXe0kzFvMF5`) ; v14, anciens visuels et affiches de test en corbeille, accès public révoqué.

## 2026-11-09 — v16 (finitions) et lien permanent

- **Prénoms animés** : positionnés dans les marges gauche/droite de l'écran (`left`/`right`), ils ne passent plus sur le logo et ne sont plus coupés sur les petits écrans (320 px).
- **`/api/download`** ajouté au routeur : redirection 302 vers l'APK de la dernière version publiée — permet des QR codes qui restent valables à chaque nouvelle version. (Déploiement Vercel à faire : les déploiements automatiques depuis GitHub sont désactivés sur le projet `streamix-app`, le push ne redéploie pas. En attendant, les visuels pointent sur le lien direct de la v16.)
- APK v16 : `versionCode 16`, `versionName "16.0"`, 2 865 175 o, certificat identique (`6876c20d…`), sha256 `ed185c7c…`, build release non débogable, assets identiques à `www/`.
- Release publiée : `POST /api/publish` → `{"published":16}` ; `GET /api/release` renvoie v16 ; l'APK servi par ce lien a été re-téléchargé et contrôlé (`aapt2 dump badging` → versionCode 16).
- Visuels UHD régénérés (QR v16, décodage vérifié sur les fichiers re-téléchargés) : vertical `1ujmDVb-4sL6GV7jblYGxrsEuO0p5Vo-E`, carré `14EqFzYntmsA2mwVRcIdDgDBIFK2o1vYr`.
- Drive : seul `Streamix-natif-v16.apk` (`1wV6SDyNg5sYNhZne_dy9xdfMSobLGE5w`) reste téléchargeable ; v15 et les visuels précédents en corbeille, accès public révoqué.
- Suite de tests automatisés : **26/26** (après les dernières retouches).
