# Build APK en ligne - 3 étapes

## Tu n'as pas de PC avec Android Studio ? Fais-le en ligne :

1. Crée un compte GitHub.com (gratuit)
2. Crée un nouveau repo "streamix" et pousse tout ce dossier :
```
git init
git add .
git commit -m "streamix"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/streamix.git
git push -u origin main
```
3. Va sur GitHub > ton repo > onglet Actions > tu verras "Build Streamix APK" en cours → à la fin clique sur "Artifacts" → télécharge `streamix-apk` → tu as ton APK !

Alternative ultra rapide : va sur https://www.pwabuilder.com → entre l'URL de ton app hébergée → Generate APK.

