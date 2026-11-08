# STREAMIX - Guide APK Android + iOS en parallèle

## APK Android (fichier installable direct)

### A. Installation en 4 commandes (sur ton PC)

Tu dois avoir Node.js + Android Studio installés.

```bash
cd streamix
npm install
npx cap add android
npx cap copy android
npx cap open android
```

Dans Android Studio qui s'ouvre :
1. Attends le sync Gradle (barre en bas)
2. Menu Build > Build APK(s) > Build APK
3. Clique sur "locate" -> récupère `app-debug.apk`
4. Envoie ce fichier sur WhatsApp / Telegram -> installation en 1 clic sur tout Android

Pour Play Store (version signée) :
Build > Generate Signed Bundle / APK > Android App Bundle > créer keystore > release

### B. Configuration déjà faite pour toi

- `capacitor.config.json` : appId `com.streamix.app`, webDir `.`, plein écran forcé
- `package.json` : dépendances Capacitor 6.1
- Le WebView charge `index.html` en fullscreen, sans barre d'adresse, sans historique
- Geste 3 doigts natif conservé (touchstart 3 doigts)
- Question de secours + login Godson06/Gedeonokana06 intégrés

### C. Personnalisation Android

- Icône : remplace `android/app/src/main/res/mipmap-*/ic_launcher.png` par ton logo Rouge/Noir
- Nom : change `appName` dans capacitor.config.json
- Splash : `android/app/src/main/res/drawable/splash.png`

## iOS (en parallèle)

```bash
npx cap add ios
npx cap copy ios
npx cap open ios
```
Dans Xcode :
- Sélectionne Team (Apple Developer)
- Bundle ID : com.streamix.app
- Deployment Target iOS 14+
- Requires Full Screen = YES, Hide status bar = YES
- Product > Archive > Distribute to TestFlight

## Fonctionnalités conservées sur les 2 plateformes

✅ Code d'accès unique (changeable)
✅ Lien Administration en bas -> login Godson06 / Gedeonokana06
✅ Code oublié -> Question : Quelle est la date de naissance d'Israël ? -> réponse 14/05/1948 (modifiable)
✅ Plein écran total au démarrage
✅ Barre masquée, seul geste 3 doigts pour l'afficher
✅ Aucune trace d'historique
✅ 2 onglets Administration / Utilisateurs
