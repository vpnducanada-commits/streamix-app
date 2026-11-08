# Streamix - APK en 2 minutes (sans code)

Tu as le ZIP `streamix-apk-projet-v2.zip` → fais ceci :

### Le plus simple (sans GitHub, sans Android Studio)

1. Va sur **https://vercel.com/new**
   - Glisse le dossier `streamix` (dézippé) → Clique `Deploy` → tu as une URL `streamix-app.vercel.app`
2. Va sur **https://www.pwabuilder.com**
   - Colle ton URL Vercel → `Start` → `Android` → `Download APK`

Tu as ton APK à installer sur ton téléphone et tester Google.com en vrai.

### Alternative GitHub Actions (APK natif 100%)
Si tu veux le vrai APK Capacitor (WebView pur) :
- Crée repo GitHub `streamix` → pousse le ZIP → va dans `Actions` → récupère `streamix-apk` dans Artifacts.

Le fichier `.github/workflows/build-apk.yml` est déjà dans ton ZIP, il fait tout auto.
