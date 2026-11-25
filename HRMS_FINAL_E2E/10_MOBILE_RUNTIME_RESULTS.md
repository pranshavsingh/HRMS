# 10. Mobile Runtime Results (`hrms_mobile`)

## Static Verification
- **TypeScript (`npx tsc --noEmit`):** **PASS** (0 errors, exit code `0`).
- **Expo ESLint (`npx expo lint`):** **FAIL** (exit code `1`, 68 problems: **20 errors**, **48 warnings** — all 20 errors are pre-existing `react-hooks/set-state-in-effect` in screen `useEffect` data fetchers and `use-color-scheme.web.ts`).

## Real-Device / Emulator Runtime Verification
- **Status:** **BLOCKED**
- **Exact Blocker:** No Android SDK (`$env:LOCALAPPDATA\Android\Sdk` = `False`), no `adb`, no Android emulator, and no iOS simulator/device is attached to this Windows host.
- **Unverified Runtime Areas:** App launch, login/logout, token refresh, tab navigation, camera punch, GPS location, file picker/upload/download, push/realtime notifications, background/foreground AppState transitions, and network recovery.
