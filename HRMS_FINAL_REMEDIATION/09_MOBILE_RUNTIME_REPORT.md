# 09. Mobile Runtime Report

- **Application:** `hrms_mobile` (React Native 0.88.1, Expo SDK 58.0.0, Expo Router ~58.0.32)
- **Platform Tested:** Windows Host Environment / Expo CLI / Node.js v24.3.0
- **Device Availability:** Physical Android/iOS devices unavailable; Android SDK and ADB not installed on host.

## Verification Executed

1. **TypeScript Static Typecheck:**
   - Command: `cd hrms_mobile; npx tsc --noEmit`
   - **Result:** **PASS (0 errors, exit code 0)**.
2. **Expo Configuration Validation:**
   - Command: `npx expo config --type public`
   - **Result:** **PASS (Exit code 0)**. Scheme `hrmsmobile`, bundle identifier `com.pranshavsingh.hrms`, permissions (`CAMERA`, `ACCESS_FINE_LOCATION`, `READ_MEDIA_IMAGES`) properly registered.
3. **Expo Web Production Bundle Export:**
   - Command: `npx expo export --platform web --output-dir C:\Users\Administrator\staging_infra\expo_web_export`
   - **Result:** **PASS (Exit code 0)**.
   - Bundled 2,710 modules in 75.7s with React Compiler enabled.
   - 31 static routes successfully emitted to disk.
4. **Runtime Limitations:**
   - End-to-end device sensor interaction (camera preview stream, native GPS lock, biometric secure store) remains **BLOCKED** due to lack of a physical Android device or local emulator.
   - Physical device verification procedure documented in [19_BLOCKED_TESTS_AND_LIMITATIONS.md](file:///f:/hrms/HRMS_FINAL_REMEDIATION/19_BLOCKED_TESTS_AND_LIMITATIONS.md).
