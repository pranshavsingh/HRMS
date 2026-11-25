# 19. Blocked Tests and Limitations

## 1. External Cloudinary Storage Credentials
- **Affected Features:** `EMP-001`, `ATT-001`..`ATT-004`, `DOC-002`..`DOC-005`
- **Affected Workflows:** `WF-03`, `WF-04`, `WF-09`
- **Root Cause:** Staging `.env.staging` deliberately omits production Cloudinary API keys to prevent accidental writes or charges.
- **Observed Behavior:** Upload routes fail closed (`500 Cloudinary storage service is not configured`). Database transactions roll back safely.
- **Required Action to Verify:** Supply dedicated staging credentials:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`

## 2. Mobile Real-Device / Emulator Runtime
- **Affected Application:** `hrms_mobile`
- **Root Cause:** Host environment lacks Android SDK, `adb`, Android Virtual Devices (AVD), and macOS Xcode / iOS Simulator.
- **Observed Behavior:** Static verification passed (TypeScript: 0 errors; Expo Lint: 0 errors, 48 warnings; Expo Web Export: 31 static routes generated). Native camera sensor stream, GPS hardware fix, and biometric storage cannot execute without a real device or emulator.
- **Required Action to Verify:**
  1. Start Metro bundler: `cd hrms_mobile; npx expo start`
  2. Connect a physical Android device via USB with USB debugging enabled.
  3. Scan the QR code in Expo Go, or build a development client via `npx expo run:android`.

## 3. ROSTER-006 Peer Shift Swaps
- **Status:** **NOT IMPLEMENTED – OUT OF SCOPE**
- **Detail:** Migration 011 contains table `workforce_shift_swap_request`, but no backend API endpoints or frontend UI components exist in the codebase. Per Section 3, no new feature was developed.
