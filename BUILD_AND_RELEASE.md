# Building Android `.aab` and `.apk` Releases

`eas.json` is preconfigured with:
- **`production` profile:** Builds a signed Android App Bundle (`.aab`).
- **`preview` profile:** Builds a standalone `.apk` for direct sideloading on your phone.

## Option A — Cloud Build via Expo EAS (Recommended, No Android SDK Required Locally)

1. Install EAS CLI and log in to your Expo account:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. Configure the EAS project once inside `devpilot-mobile/`:
   ```bash
   eas build:configure
   ```
3. Build the `.aab` (or `.apk` for direct phone install):
   ```bash
   # Android App Bundle (.aab)
   eas build --platform android --profile production

   # Direct-install .apk for testing on your phone
   eas build --platform android --profile preview
   ```
4. Download the `.aab` / `.apk` from the link printed by EAS CLI.

## Option B — Local Android `.aab` Build (Requires JDK 17 + Android SDK)

1. Generate the native `android/` project:
   ```bash
   npx expo prebuild --platform android
   ```
2. Build the release `.aab`:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   Output bundle path:
   `android/app/build/outputs/bundle/release/app-release.aab`

3. Or build a release `.apk`:
   ```bash
   ./gradlew assembleRelease
   ```
   Output APK path:
   `android/app/build/outputs/apk/release/app-release.apk`
