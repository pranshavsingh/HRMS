# 17. Blocked Tests and Limitations

| Item | Category | Exact Blocker | Impact |
|---|---|---|---|
| **Mobile Runtime Testing** (`hrms_mobile` 17+ screens) | Infrastructure | No Android SDK (`$env:LOCALAPPDATA\Android\Sdk` missing), no `adb`, no emulator, no physical device/iOS simulator. | Mobile runtime gestures, camera, GPS, background/foreground Socket.IO recovery remain unverified on device. |
| **Live Cloudinary Media Uploads** (`EMP-001`, `ATT-001`..`004`, `DOC-002`..`005`) | External Credential Isolation | Staging `.env.staging` omits production Cloudinary keys to avoid polluting production media buckets; `StorageService.store()` fails closed with `500`. | End-to-end live Cloudinary multipart upload/delete unverified in staging. |
| **Peer Shift Swaps** (`ROSTER-006`) | Missing Implementation | DB table `workforce_shift_swap_request` exists (Migration `011`), no backend API or UI implemented. | Documented as `NOT IMPLEMENTED`; not added per Scope Restriction. |
| **Mobile Expo Lint** (`npx expo lint`) | Pre-existing Lint Errors | 20 pre-existing `react-hooks/set-state-in-effect` errors and 48 warnings. | Exited `1`; TypeScript (`tsc --noEmit`) passed with `0` errors. |
