# AIntegration Android APK

## How it works

The Android app is a thin [Capacitor 7](https://capacitorjs.com/) shell (`android/`) whose WebView loads the **live site**
`https://cihanhartamaci.github.io/logiwa-api-consultant/` (`server.url` in `capacitor.config.json`).

- The page origin stays `cihanhartamaci.github.io`, so the referrer-restricted Gemini keys and the Cloudflare Worker CORS keep working.
- **Site updates (`npm run deploy`) reach the app immediately; no new APK is needed.** Rebuild only for native changes (icon, app id, permissions, Capacitor upgrade, `MainActivity`).
- Links to other hosts (Help Center articles, aistudio.google.com, …) open in the phone's browser. Iframes (YouTube cinematics) play inline, and media autoplay is allowed.
- Android Back navigates WebView history and closes the app when there's nothing left to go back to.
- An internet connection is required. With no connection, the WebView shows its error page.

## Install on a phone

1. Download `AIntegration.apk` on the phone (GitHub release `android-v1.0.0` on this repo, or copy the file over USB).
2. Open it. When Android asks, allow **Install unknown apps** for the browser/file manager you used.
3. Confirm the install. Play Protect may warn about an unknown developer (the APK is debug-signed); choose *Install anyway*.

## Rebuild

Prerequisites: JDK 21 (`JAVA_HOME`), the Android SDK at `%LOCALAPPDATA%\Android\Sdk` with `platform-tools`, `platforms;android-35`, `build-tools;35.0.0`,
and `ANDROID_HOME` / `ANDROID_SDK_ROOT` pointing to it (or `android/local.properties` with `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`; that file is git-ignored).

```powershell
node ./node_modules/vite/bin/vite.js build   # webDir (dist) must exist for cap sync
npx cap sync android
cd android
.\gradlew.bat assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Bump `versionCode` / `versionName` in `android/app/build.gradle` before publishing a new build. Capacitor 8 requires Node 22, so the project is pinned to Capacitor 7 while Node 20 is in use.

Launcher icons and splash images in `android/app/src/main/res` were generated from `src/assets/logiwa-mark.png` on a `#E7F6FB` background.
