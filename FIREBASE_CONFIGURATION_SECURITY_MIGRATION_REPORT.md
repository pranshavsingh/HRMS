# Firebase Android Configuration Security Migration Report

## 1. Summary
Removed `hrms_mobile/google-services.json` from Git tracking and configured `hrms_mobile/app.json` to consume the EAS File Environment Variable `GOOGLE_SERVICES_JSON` during cloud builds, while preserving the local `google-services.json` file, Android package (`com.pranshavsingh.hrms`), EAS `projectId` (`ccc583cb-7ad8-42b5-b2b6-c8601ffc1a48`), `runtimeVersion`, OTA update channels, and push notification code untouched.

## 2. Files Modified
- [app.json](file:///f:/hrms/hrms_mobile/app.json#L18): updated `expo.android.googleServicesFile` from `"./google-services.json"` to `"$GOOGLE_SERVICES_JSON"`.
- [.gitignore](file:///f:/hrms/hrms_mobile/.gitignore#L45-L46): added `google-services.json` ignore rule.
- Git index: ran `git rm --cached hrms_mobile/google-services.json` (local file preserved on disk).

## 3. Local Development Requirements
- **Standard JS/TS & Expo Go / Dev Client:** `npx tsc --noEmit`, `npx expo lint`, and `npx expo start` work without `GOOGLE_SERVICES_JSON` set.
- **Local Native Prebuild (`npx expo prebuild` / `npx expo run:android`):** Keep the gitignored `hrms_mobile/google-services.json` on disk and set `GOOGLE_SERVICES_JSON=./google-services.json` in `hrms_mobile/.env.local` (or shell environment) before running local native builds.

## 4. EAS Environment Requirements (Verified)
`npx eas-cli env:list` verified `GOOGLE_SERVICES_JSON=*****` (Secret File variable) is configured in all three EAS environments:
- **`development`**: `GOOGLE_SERVICES_JSON=*****`
- **`preview`**: `GOOGLE_SERVICES_JSON=*****`
- **`production`**: `GOOGLE_SERVICES_JSON=*****`

## 5. Validation Results (Observed)
- `Test-Path f:\hrms\hrms_mobile\google-services.json` → **`True`** (local file preserved untouched).
- `git check-ignore -v hrms_mobile/google-services.json` → **`hrms_mobile/.gitignore:46:google-services.json`** (ignored by Git).
- `git ls-files hrms_mobile/google-services.json` → **0 tracked files** (removed from Git index).
- `npx tsc --noEmit` → **Exited `0`** (0 TypeScript errors).
- `npx expo config --type public` → resolved `package: 'com.pranshavsingh.hrms'`, `googleServicesFile: '$GOOGLE_SERVICES_JSON'`, `projectId: 'ccc583cb-7ad8-42b5-b2b6-c8601ffc1a48'`.
- `npx expo-doctor` → **19/20 checks passed** (`app.json` schema validation passed; 1 pre-existing check for 9 out-of-date SDK 58 packages).
- `eas build` → **NOT EXECUTED** (blocked until `GOOGLE_SERVICES_JSON` File variable is uploaded in Expo EAS).

## 6. Remaining Manual Actions
1. Restrict the `AIzaSy...` client key in Google Cloud Console (`hrms-production-828f1`) to Android app `com.pranshavsingh.hrms` + EAS SHA-1 (`BD:47:6D:CB:D2:20:AB:3C:36:BB:A5:4A:9B:5A:80:AC:72:BD:AC:BD`), then close the GitHub Secret Scanning alert.
2. Run a `preview` EAS build (`npx eas-cli build -p android --profile preview`) when ready to test.
