# HRMS Mobile — EAS Over-The-Air (OTA) Updates Audit & Release Guide

## 1. Read-Only Pre-Implementation Audit Summary
- **App & SDK:** `hrms_mobile` on Expo SDK `58.0.0` (`react-native@0.88.1`, `expo-router@~58.0.32`, TypeScript).
- **Identifiers:** Android `com.pranshavsingh.hrms`, iOS `com.pranshavsingh.hrms`, EAS `projectId: ccc583cb-7ad8-42b5-b2b6-c8601ffc1a48`, owner `ssehrms`.
- **Push & Firebase:** `expo-notifications` + `googleServicesFile: "./google-services.json"` (`hrms-production-828f1`) + EAS FCM V1 Service Account key configured.
- **Baseline Gaps Found:**
  1. `expo-updates` was not installed in `package.json`.
  2. `app.json` lacked `updates` and `runtimeVersion`, and had `android.usesCleartextTraffic: false` (disallowed in Expo SDK 58 `app.json` schema).
  3. `eas.json` lacked `channel` bindings on `development`, `preview`, and `production` profiles.
  4. No EAS Update channels or branches existed on `@ssehrms/hrms_mobile`.
  5. Baseline `npx expo-doctor`: 18/20 passed (2 failed: `app.json` schema + 9 pre-existing minor/patch package mismatches).

## 2. OTA Architecture Overview
- **Update Engine:** `expo-updates@~58.0.23` configured with `updates.url = "https://u.expo.dev/ccc583cb-7ad8-42b5-b2b6-c8601ffc1a48"`, `checkAutomatically: "ON_LOAD"`, and `fallbackToCacheTimeout: 0`.
- **Non-Blocking Startup & Offline Safety:** With `fallbackToCacheTimeout: 0`, cold launches immediately boot the last verified cached or embedded bundle (zero hang offline or when Expo's CDN is unreachable) while checking for updates in the background.
- **Workflow-Safe Lifecycle (`src/services/otaUpdateService.ts` + `src/app/_layout.tsx`):**
  - Checks silently on startup and on `AppState` foreground resume (guarded by a 5-minute cooldown and single in-flight promise deduplication).
  - Downloads compatible updates in the background (`Updates.fetchUpdateAsync()`), **without** calling `Updates.reloadAsync()` mid-session — protecting attendance punch-in/out, leave forms, approvals, and document uploads from interruption.
  - Downloaded updates apply automatically on the next cold start, or when the user taps **Restart to Apply Update** inside **Profile → App & Updates**.

## 3. Files Created & Modified
- **Created:**
  - `hrms_mobile/src/services/otaUpdateService.ts` — safe OTA check/fetch/manual-apply service + diagnostics + reload-loop guard.
  - `OTA_UPDATES_AUDIT_AND_RELEASE_GUIDE.md` — this audit, architecture, rollback, and release guide.
- **Modified:**
  - `hrms_mobile/package.json` & `hrms_mobile/package-lock.json` — added `expo-updates@~58.0.23`.
  - `hrms_mobile/app.json` — added `runtimeVersion` (`{"policy": "appVersion"}`) & `updates` config, deduplicated `android.permissions`, removed schema-invalid `android.usesCleartextTraffic`.
  - `hrms_mobile/eas.json` — added `"channel": "development"`, `"channel": "preview"`, `"channel": "production"` to the 3 build profiles.
  - `hrms_mobile/src/app/_layout.tsx` — wired non-blocking startup & foreground-resume OTA checks.
  - `hrms_mobile/src/app/profile.tsx` — added compact **App & Updates** diagnostics card (`appVersion`, `runtimeVersion`, `channel`, `Embedded` vs `OTA` bundle ID, status, **Check for Updates**, and **Restart to Apply Update**).

## 4. Runtime Version Strategy
- **Policy:** `{"policy": "appVersion"}` (bound to `expo.version` in `app.json`, currently `"1.0.0"`).
- **Why:** Native binaries and OTA bundles only match when `runtimeVersion` is identical. Keeping `expo.version` unchanged for JS/UI hotfixes allows seamless OTA delivery; bumping `expo.version` (e.g., `1.0.0` → `1.1.0`) whenever native dependencies, permissions, `google-services.json`, or Expo SDK change guarantees old APKs never download incompatible JS bundles.

## 5. Build Profiles & Channel-to-Branch Mapping

| EAS Build Profile | Distribution | Android Output | API URL (`EXPO_PUBLIC_API_URL`) | EAS Channel | Mapped EAS Branch |
|---|---|---|---|---|---|
| `development` | `internal` (`developmentClient: true`) | Dev Client | `http://10.0.2.2:8000/api` | `development` | `development` |
| `preview` | `internal` | `.apk` | `https://api.sseone.io/api` | `preview` | `preview` |
| `production` | `store` | `.aab` (App Bundle) | `https://api.sseone.io/api` | `production` | `production` |

All three channels and branches were created and verified on `@ssehrms/hrms_mobile` via `npx eas-cli channel:create` and `npx eas-cli channel:list --json`.

## 6. OTA-Eligible vs. New-Binary-Required Changes

| Change Type | Delivery Method |
|---|---|
| React Native UI, styles, screens, copy, JS/TS bug fixes, API integration, Expo Router routes, bundled images | **OTA Update (`eas update`)** |
| Installing/removing native modules, changing `android.permissions`, updating `google-services.json` or plugins, upgrading Expo SDK | **New Binary (`eas build`) + bump `expo.version`** |

## 7. Security Assessment
- **Private Credentials:** Firebase FCM V1 Service Account JSON is stored in EAS Credentials only (not in `hrms_mobile`), and backend secrets (`VAPID_PRIVATE_KEY`, DB/JWT secrets) remain in `node_backend/.env`.
- **Mobile Bundle:** Only `EXPO_PUBLIC_API_URL` is embedded in mobile builds; no private keys or employee PII are included in `app.json`, `eas.json`, or update metadata.

## 8. Rollback & Recovery Procedures
1. **Automatic Crash Recovery:** Because `checkAutomatically: "ON_LOAD"` and `fallbackToCacheTimeout: 0` are configured, if a newly published OTA update crashes during startup before rendering, `expo-updates` automatically falls back to the last working embedded/cached bundle.
2. **Roll Back via EAS CLI (re-publish a previous known-good update):**
   ```bash
   cd f:\hrms\hrms_mobile
   # List recent update groups on the target branch
   npx eas-cli update:list --branch preview
   # Roll back by republishing a known-good update group
   npx eas-cli update:republish --group <KNOWN_GOOD_GROUP_ID>
   ```
   *(Or use `npx eas-cli update:rollback --branch preview` if using the interactive/non-interactive rollback wizard supported by your `eas-cli` version.)*
3. **Emergency Revert in Git + Republish:**
   ```bash
   git revert <BAD_COMMIT>
   npx eas-cli update --branch preview --message "Rollback: revert broken update"
   ```

## 9. Verification & Regression Results (Observed)
- `npx eas-cli update:configure --platform all` → **Exited `0`** (`updates.url` and `runtimeVersion` configured).
- `npx eas-cli channel:create` (`development`, `preview`, `production`) & `channel:list --json` → **Exited `0`** (all 3 channels & branches active).
- `npx tsc --noEmit` → **Exited `0`** (0 TypeScript errors).
- `npx expo lint` → **Exited `0`** (0 errors; 71 pre-existing warnings in unrelated files).
- `npx expo-doctor` → **19/20 checks passed** (`app.json` schema check now **PASSES**; 1 pre-existing minor/patch version drift check remains for `expo@58.0.26` vs `~58.1.0` and 8 unrelated SDK 58 packages; `expo-updates@~58.0.23` matches).
- **Physical Device & Live OTA / Push Tests:** **NOT_TESTED** in this CLI environment (no preview APK was built or installed on a physical Android device during this step, and no production update was published per Rule 16).

## 10. Step-by-Step Developer Release Workflow

### First OTA-Enabled Preview Build (Required Once After Adding `expo-updates`)
```bash
cd f:\hrms\hrms_mobile
npx eas-cli build --platform android --profile preview
```
Download and install the generated `.apk` on test Android devices.

### Publish a Preview OTA Update
```bash
cd f:\hrms\hrms_mobile
npx eas-cli update --branch preview --message "Preview: attendance UI improvement"
```

### Publish a Production OTA Update (Only After Preview Verification)
```bash
cd f:\hrms\hrms_mobile
npx eas-cli update --branch production --message "Production: attendance UI improvement"
```

### Verify Push Notifications After Installing the New Preview APK
1. Log in on the installed preview APK, open **Notifications → Push**, tap **Enable & Register This Device**, and verify the `expo` token appears in `GET /api/notifications/devices`.
2. Test foreground, background, and terminated push delivery, notification tap deep-linking, and logout/account-switch token cleanup.
