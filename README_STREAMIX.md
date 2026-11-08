# STREAMIX - Guide complet

## 1. Prototype livré ✅
Le prototype est dans /home/user/streamix
- index.html : écran de verrouillage + navigateur plein écran
- style.css : thème Rouge & Noir
- app.js : logique codes + geste 3 doigts + fullscreen
- manifest.json : mode PWA fullscreen pour iOS

## 2. Comment tester le prototype
Ouvrir le Live Preview (port 8000) sur mobile ou desktop.

### Codes de démo :
- Utilisateur : `STREAMIX`
- Admin : `ADMIN2026`
- Autres codes générés : visibles dans onglet Utilisateurs

### Fonctionnalités implémentées :
✅ Verrouillage par code personnalisable (changeable dans Administration)
✅ Plein écran automatique dès l'ouverture
✅ Barre de recherche MASQUÉE par défaut
✅ Aucun historique (aucune sauvegarde, cookies non persistants)
✅ Geste 3 doigts instantané pour afficher/masquer la barre
✅ 2 grands onglets : Administration (URL, code, options) + Utilisateurs (génération codes)
✅ Thème Rouge & Noir + optimisé iOS (status bar, viewport-fit)

### Geste 3 doigts :
- Mobile : pose 3 doigts simultanément sur l'écran
- Desktop (test) : Ctrl+Shift+B ou triple-clic

## 3. Passage en vraie app iOS (iPhone)

### Option A : Capacitor (recommandée - WebView native)
```bash
npm i -g @capacitor/cli
npx cap init Streamix com.streamix.app
npm install @capacitor/ios
npx cap add ios
# Copier les fichiers du prototype dans www/
npx cap copy ios
npx cap open ios # Ouvre Xcode
```
Dans Xcode :
- Configurer Bundle ID, Team, icône Rouge/Noir
- Activer "Requires Full Screen" + masquer status bar
- Build > Archive > Distribuer sur TestFlight / App Store

Avantages : garde tout ton code actuel, publication App Store rapide.

### Option B : Swift natif (WKWebView - 100% kiosque)
Créer projet Xcode Single View App :
- WKWebView en fullscreen
- Masquer navigation bar
- UIGestureRecognizer avec numberOfTouchesRequired = 3
- UserDefaults pour stocker code + URL par défaut (pas de CoreData historique)
- Pas de WKWebsiteDataStore persistant = 0 historique garanti

### Spécificités App Store pour un navigateur :
Apple exige que tu déclares que c'est un navigateur avec Safari View Controller ou WKWebView. Prévoir :
- Icône 1024x1024 Rouge/Noir
- Captures iPhone 6.7" et 6.5"
- Description : "Navigateur privé plein écran..."
- Politique de confidentialité (pas de collecte)

## 4. Ce qu'il te reste à fournir
1. Le lien réel sur lequel Streamix doit toujours s'ouvrir (tu as mis placeholder)
2. Ton logo final (si différent du ▶ Streamix actuel)
3. Veux-tu que le code expire ? (7j / 30j / illimité)
4. As-tu un compte Apple Developer (99$/an) pour publier ?

## 5. Améliorations possibles
- Code QR pour partager un code utilisateur
- Limitation à 1 appareil par code
- Mode offline avec cache du site autorisé
- Notifications push promo
- Version Android APK en parallèle (même code, via Capacitor Android)
