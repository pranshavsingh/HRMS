# HRMS – Face Detection, Alignment, Quality & Capture Race Fix Report

**Date:** 2026-11-27  
**Scope:** React Web (`hrms_saas`), Expo Mobile (`hrms_mobile`), Regression Tests (`node_backend/tests/e2e/face_detection_validation.test.js`)  
**Constraint Compliance:** No face recognition, biometric embeddings, enrollment, liveness/anti-spoofing, or database migrations were introduced.

---

## 1. Files Changed

- **React Web (`hrms_saas`):**
  - `hrms_saas/src/utils/faceValidation.js` (new) — Shared pure face visibility, 3-axis pose (yaw/pitch/roll), and single-pass image quality (`analyzeFaceImageQuality`, `evaluateFaceDetections`) validator.
  - `hrms_saas/src/pages/Attendance.jsx` — Integrated `evaluateFaceDetections` with `detectAllFaces`, 2-frame stability counter (`"Hold Still"` → `"Face Aligned – Ready to Capture"`), reusable canvas evaluation, and capture-before-GPS submission flow (`"Face captured successfully."`).
- **Expo Mobile (`hrms_mobile`):**
  - `hrms_mobile/src/app/(tabs)/punch.tsx` — Upgraded WebView face detection loop with `detectAllFaces`, `evaluateFaceDetections`, `analyzeFaceImageQuality`, `isDetecting` mutex, `isCapturing` guard, reusable `evalCanvas` + `outputCanvas`, 2-frame stability counter, `beforeunload` stream cleanup, and capture-before-GPS ordering (`handleCaptureAndSubmit` → `CAPTURE` → freeze immutable temp JPEG → `acquireBestMobileGpsPosition` → upload).
- **Tests:**
  - `node_backend/tests/e2e/face_detection_validation.test.js` (new) — Automated unit + static integration verification covering all pose, visibility, lighting/blur, and capture-before-GPS requirements.

---

## 2. Face Detection, Alignment & Image Quality Improvements

| Category | Previous Behavior | New Behavior |
|---|---|---|
| **Multi-Face** | `detectSingleFace` silently ignored extra people | `detectAllFaces` rejects `detections.length > 1` with `"Multiple Faces Detected"` |
| **Visibility & Bounds** | Height ratio `0.18..0.40` only; clipped faces passed | Min `80x80` px face size, height `0.18..0.48`, width `<= 0.55`, 4% edge margin on all 4 sides, center guide `[0.20..0.80, 0.15..0.85]`, all 68 key landmarks inside frame (`"Face Not Fully Visible"`) |
| **3-Axis Alignment** | Horizontal `symmetryRatio <= 1.5` only (downward gaze passed) | **Roll** `<= 12°`, **Yaw** (`yawOffset <= 0.20`, `symmetryRatio <= 1.38`), **Pitch** (`0.36 <= pitchRatio <= 0.78` with `"Look Up"` / `"Look Down"` / `"Look Straight"`) |
| **Image Quality** | Blur check only (`< 35`), returned `100` (pass) on exception | Single-pass brightness (`45..220`), contrast std-dev (`>= 18`), overexposure (`<= 45%`), underexposure (`<= 55%`), Laplacian blur (`>= 35`), **fails closed** on exception |
| **Stability** | Single 400ms frame enabled submission | Requires **2 consecutive passing frames** (`"Hold Still"` → `"Face Aligned – Ready to Capture"`); resets on any failure |
| **Messaging** | `"Perfect! Face verified. Ready to capture."` | `"Face Aligned – Ready to Capture"` before click; `"Face captured successfully."` after frame freeze |

---

## 3. Frame Capture Race Condition Fix (Web & Mobile)

- **Before:** Clicking **Capture & Submit** showed `"Processing..."`, awaited GPS convergence (`6–7 seconds`), and *then* captured a new live `<video>` frame without re-validating it.
- **After:**
  - **Web (`Attendance.jsx:handleSubmit`):** Immediately calls `captureImage()` onto `canvasRef.current`, re-runs `detectAllFaces` + `evaluateFaceDetections` on that exact captured canvas, freezes the immutable JPEG `Blob`, displays `"Face captured successfully."`, **then** acquires fresh GPS (`getLocation({ timeout: 6000 })`), and uploads the already-frozen `Blob`.
  - **Mobile (`punch.tsx:handleCaptureAndSubmit` → `processAndUploadCapturedSelfie`):** Immediately triggers WebView `CAPTURE`, re-validates the exact captured `evalCanvas` with `detectAllFaces` + `evaluateFaceDetections`, writes the immutable JPEG to `FileSystem.cacheDirectory`, displays `"Face captured successfully."`, **then** acquires fresh GPS (`acquireBestMobileGpsPosition`), and uploads that immutable file.

---

## 4. Mobile Performance & Resource Cleanup

- Added `isDetecting` mutex in `startDetectionLoop` (400ms) so slower Android WebViews never stack overlapping TensorFlow inferences.
- Added `isCapturing` guard to prevent duplicate capture triggers and `if (submitting) return;` in `handleCaptureAndSubmit`.
- Reused `evalCanvas` and `outputCanvas` instead of allocating a new `<canvas>` every `400ms`.
- Added `window.addEventListener('beforeunload', stopCamera)` and preserved `tempUri` cleanup in `finally`.

---

## 5. Verification & Test Results

- **Face Validation & Capture Race Tests (`node --test tests/e2e/face_detection_validation.test.js`):** **5/5 passed** (aligned frontal face, yaw/pitch-down/pitch-up/roll rejection, missing/multi-face/clipped/too-close/too-far rejection, blurry/dark/overexposed/fail-closed quality checks, Web & Mobile capture-before-GPS ordering + mutexes + messaging).
- **GPS Telemetry E2E (`node --test tests/e2e/gps_accuracy_telemetry.test.js`):** **3/3 passed**.
- **React Web Build (`npm run build` in `hrms_saas`):** **Passed** (`vite build` in `3.82s`, 1,865 modules).
- **Mobile TypeScript & Expo Lint (`npx tsc --noEmit` & `npx expo lint 'src/app/(tabs)/punch.tsx'`):** **Passed** (0 errors; 1 pre-existing unused `MapPin` warning).
- **Device QA Note:** Physical Android/desktop camera field testing with live subjects is recommended post-deployment to fine-tune `minPitchRatio`/`maxPitchRatio` across device front-camera angles.

---

## 6. Rollback Instructions

1. Revert `hrms_saas/src/pages/Attendance.jsx`, delete `hrms_saas/src/utils/faceValidation.js`, and revert `hrms_mobile/src/app/(tabs)/punch.tsx`.
2. No backend or MySQL schema rollback is required.
