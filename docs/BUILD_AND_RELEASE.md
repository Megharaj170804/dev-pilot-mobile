# Building Android `.aab` & `.apk` Releases

DevPilot Mobile (`net.tekdi.devpilot`) is preconfigured in `eas.json` and `app.json` for both **Android App Bundle (`.aab`)** Play Store/internal distribution and **standalone `.apk`** sideloading.

---

## Build Profiles (`eas.json`)

| Profile | Distribution | Output | Use Case |
| --- | --- | --- | --- |
| `development` | `internal` | Dev client | Local debugging with custom native modules |
| `preview` | `internal` | `.apk` | Direct USB / download install onto your Android phone |
| `production` | Store / Release | `.aab` (`app-bundle`) | Play Store upload or bundletool extraction |

---

## Option A — Cloud Build via Expo EAS (Recommended, No Local Android SDK Required)

1. Install EAS CLI and authenticate with your Expo account:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. Link the project once inside `devpilot-mobile/`:
   ```bash
   eas build:configure
   ```
3. Run your desired Android build:
   ```bash
   # Signed Android App Bundle (.aab)
   eas build --platform android --profile production

   # Direct-install Android APK (.apk) for phone sideloading
   eas build --platform android --profile preview
   ```
4. Download the generated `.aab` or `.apk` from the Expo build URL printed in your terminal.

---

## Option B — Local Android Build (Requires JDK 17 + Android SDK)

1. Generate the native `android/` project from `app.json`:
   ```bash
   npx expo prebuild --platform android
   ```
2. Build the release `.aab` or `.apk`:
   ```bash
   cd android

   # Release Android App Bundle (.aab)
   ./gradlew bundleRelease

   # Direct-install Release APK (.apk)
   ./gradlew assembleRelease
   ```
3. Locate build artifacts:
   - `.aab`: `android/app/build/outputs/bundle/release/app-release.aab`
   - `.apk`: `android/app/build/outputs/apk/release/app-release.apk`

---

## Release Checklist Before Building

- Verify TypeScript compiles cleanly: `npm run typecheck`
- Update `expo.version` and `expo.android.versionCode` in `app.json` for subsequent releases.
- If connecting from a physical phone to your DevPilot server (`server.js`), ensure your laptop and phone share the same network and configure `http://<laptop-lan-ip>:3333` under **Settings -> DevPilot Server Proxy** (never `localhost`).
