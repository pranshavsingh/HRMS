import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  evaluateFaceDetections,
  analyzeFaceImageQuality,
} from "../../../hrms_saas/src/utils/faceValidation.js";

function makeMockLandmarks({
  leftEye = { x: 280, y: 200 },
  rightEye = { x: 360, y: 200 },
  noseTip = { x: 320, y: 245 },
  mouth = { x: 320, y: 280 },
} = {}) {
  return {
    getLeftEye: () => [leftEye],
    getRightEye: () => [rightEye],
    getNose: () => [
      { x: noseTip.x, y: noseTip.y - 20 },
      { x: noseTip.x, y: noseTip.y - 10 },
      { x: noseTip.x, y: noseTip.y - 5 },
      noseTip,
    ],
    getMouth: () => [mouth],
  };
}

function makeMockDetection(box = { x: 220, y: 120, width: 200, height: 200 }, landmarkOpts = {}) {
  return {
    detection: { box },
    landmarks: makeMockLandmarks(landmarkOpts),
  };
}

function makeMockCanvasCtx({ width = 640, height = 480, mode = "sharp" } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let val = 128;
      if (mode === "sharp") {
        // High-frequency textured pattern (sharp edges + good contrast + mid brightness)
        val = (x + y) % 2 === 0 ? 185 : 75;
      } else if (mode === "blurry") {
        // Smooth low-frequency gradient: good brightness & contrast (>18 stdDev), near-zero Laplacian variance (blurry)
        val = Math.round(130 + 60 * Math.sin(x / 25));
      } else if (mode === "dark") {
        val = 15;
      } else if (mode === "overexposed") {
        val = 252;
      }
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return {
    canvas: { width, height },
    getImageData: (cx, cy, cw, ch) => {
      const out = new Uint8ClampedArray(cw * ch * 4);
      for (let r = 0; r < ch; r++) {
        for (let c = 0; c < cw; c++) {
          const srcIdx = ((cy + r) * width + (cx + c)) * 4;
          const dstIdx = (r * cw + c) * 4;
          out[dstIdx] = data[srcIdx];
          out[dstIdx + 1] = data[srcIdx + 1];
          out[dstIdx + 2] = data[srcIdx + 2];
          out[dstIdx + 3] = 255;
        }
      }
      return { width: cw, height: ch, data: out };
    },
  };
}

describe("Face Detection, Alignment, Quality & Capture Race Fix", () => {
  it("1. Accepts properly aligned, sharp, well-lit frontal face", () => {
    const ctx = makeMockCanvasCtx({ mode: "sharp" });
    const res = evaluateFaceDetections({
      detections: [makeMockDetection()],
      frameWidth: 640,
      frameHeight: 480,
      evalCtx: ctx,
    });
    assert.equal(res.ok, true);
    assert.equal(res.message, "Face Aligned – Ready to Capture");
  });

  it("2. Rejects sideways (yaw), downward (pitch), upward (pitch), and tilted (roll) faces", () => {
    const ctx = makeMockCanvasCtx({ mode: "sharp" });

    // Sideways (yaw)
    const yawRes = evaluateFaceDetections({
      detections: [makeMockDetection(undefined, { noseTip: { x: 350, y: 245 } })],
      frameWidth: 640,
      frameHeight: 480,
      evalCtx: ctx,
    });
    assert.equal(yawRes.ok, false);
    assert.equal(yawRes.message, "Look Straight");

    // Downward-looking (pitchRatio > 0.78)
    const downRes = evaluateFaceDetections({
      detections: [makeMockDetection(undefined, { noseTip: { x: 320, y: 272 } })],
      frameWidth: 640,
      frameHeight: 480,
      evalCtx: ctx,
    });
    assert.equal(downRes.ok, false);
    assert.equal(downRes.message, "Look Up");

    // Upward-looking (pitchRatio < 0.36)
    const upRes = evaluateFaceDetections({
      detections: [makeMockDetection(undefined, { noseTip: { x: 320, y: 215 } })],
      frameWidth: 640,
      frameHeight: 480,
      evalCtx: ctx,
    });
    assert.equal(upRes.ok, false);
    assert.equal(upRes.message, "Look Down");

    // Head roll > 12 degrees
    const rollRes = evaluateFaceDetections({
      detections: [makeMockDetection(undefined, { leftEye: { x: 280, y: 180 }, rightEye: { x: 360, y: 220 } })],
      frameWidth: 640,
      frameHeight: 480,
      evalCtx: ctx,
    });
    assert.equal(rollRes.ok, false);
    assert.equal(rollRes.message, "Look Straight");
  });

  it("3. Rejects missing face, multiple faces, clipped/partial faces, too close & too far", () => {
    assert.equal(evaluateFaceDetections({ detections: [], frameWidth: 640, frameHeight: 480 }).message, "Detecting Face");
    assert.equal(
      evaluateFaceDetections({ detections: [makeMockDetection(), makeMockDetection()], frameWidth: 640, frameHeight: 480 }).message,
      "Multiple Faces Detected"
    );
    // Clipped at left edge
    assert.equal(
      evaluateFaceDetections({ detections: [makeMockDetection({ x: 5, y: 120, width: 160, height: 160 })], frameWidth: 640, frameHeight: 480 }).message,
      "Face Not Fully Visible"
    );
    // Too close
    assert.equal(
      evaluateFaceDetections({ detections: [makeMockDetection({ x: 180, y: 40, width: 260, height: 260 })], frameWidth: 640, frameHeight: 480 }).message,
      "Move Farther Away"
    );
    // Too far
    assert.equal(
      evaluateFaceDetections({ detections: [makeMockDetection({ x: 280, y: 200, width: 60, height: 60 })], frameWidth: 640, frameHeight: 480 }).message,
      "Move Closer"
    );
  });

  it("4. Rejects blurry, dark, overexposed frames and fails closed on exception", () => {
    assert.equal(analyzeFaceImageQuality(makeMockCanvasCtx({ mode: "blurry" }), 220, 120, 200, 200).message, "Image Blurry");
    assert.equal(analyzeFaceImageQuality(makeMockCanvasCtx({ mode: "dark" }), 220, 120, 200, 200).message, "Poor Lighting");
    assert.equal(analyzeFaceImageQuality(makeMockCanvasCtx({ mode: "overexposed" }), 220, 120, 200, 200).message, "Poor Lighting");

    // Fail closed on error (must NOT return passing score)
    const brokenCtx = { canvas: { width: 640, height: 480 }, getImageData: () => { throw new Error("tainted"); } };
    assert.equal(analyzeFaceImageQuality(brokenCtx, 220, 120, 200, 200).ok, false);
  });

  it("5. Verifies Web & Mobile capture-before-GPS ordering, mutexes, and updated messaging", () => {
    const repoRoot = path.resolve(process.cwd(), "..");

    const webAtt = fs.readFileSync(path.join(repoRoot, "hrms_saas/src/pages/Attendance.jsx"), "utf8");
    assert.ok(!webAtt.includes("Perfect! Face verified"), "Web must not display misleading 'Face verified'");
    assert.ok(webAtt.includes("Face captured successfully."));
    const captureIdx = webAtt.indexOf("const image = await captureImage();");
    const gpsIdx = webAtt.indexOf("const freshCoords = await getLocation(");
    assert.ok(captureIdx > 0 && gpsIdx > captureIdx, "Web must capture & freeze image BEFORE awaiting GPS");

    const mobPunch = fs.readFileSync(path.join(repoRoot, "hrms_mobile/src/app/(tabs)/punch.tsx"), "utf8");
    assert.ok(!mobPunch.includes("Perfect! Face verified"), "Mobile must not display misleading 'Face verified'");
    assert.ok(mobPunch.includes("isDetecting") && mobPunch.includes("isCapturing"));
    assert.ok(mobPunch.includes("Face captured successfully."));
    const mobCaptureIdx = mobPunch.indexOf('type: "CAPTURE"');
    const mobSubmitStart = mobPunch.indexOf("const handleCaptureAndSubmit");
    const mobUploadStart = mobPunch.indexOf("const processAndUploadCapturedSelfie");
    assert.ok(mobCaptureIdx > mobSubmitStart && mobCaptureIdx < mobUploadStart, "Mobile must trigger CAPTURE before awaiting GPS in processAndUploadCapturedSelfie");
  });
});
