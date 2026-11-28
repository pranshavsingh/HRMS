/**
 * Pure face alignment, visibility, and image quality validation for Web Attendance.
 * Uses @vladmandic/face-api (tinyFaceDetector + faceLandmark68Net) only — no biometric matching.
 */

export const FACE_VALIDATION_CONFIG = {
  scoreThreshold: 0.5,
  inputSize: 224,
  minFacePixels: 80,
  minHeightRatio: 0.18,
  maxHeightRatio: 0.48,
  maxWidthRatio: 0.55,
  edgeMarginRatio: 0.04,
  maxYawOffset: 0.20,
  maxSymmetryRatio: 1.38,
  minPitchRatio: 0.36,
  maxPitchRatio: 0.78,
  maxRollDegrees: 12,
  minBlurVariance: 35,
  minBrightness: 45,
  maxBrightness: 220,
  minContrastStdDev: 18,
  maxOverexposedRatio: 0.45,
  maxUnderexposedRatio: 0.55,
  requiredStableFrames: 2,
};

/**
 * Single-pass grayscale image quality & Laplacian blur analysis on face bounding box.
 * Fails closed (ok: false) on any error.
 */
export function analyzeFaceImageQuality(ctx, x, y, width, height, cfg = FACE_VALIDATION_CONFIG) {
  try {
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    const cropX = Math.max(0, Math.floor(x));
    const cropY = Math.max(0, Math.floor(y));
    const cropWidth = Math.min(canvasWidth - cropX, Math.floor(width));
    const cropHeight = Math.min(canvasHeight - cropY, Math.floor(height));

    if (cropWidth <= 8 || cropHeight <= 8) {
      return { ok: false, reason: "visibility", message: "Face Not Fully Visible" };
    }

    const imgData = ctx.getImageData(cropX, cropY, cropWidth, cropHeight);
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;
    const totalPixels = w * h;

    const gray = new Float32Array(totalPixels);
    let lumSum = 0;
    let lumSqSum = 0;
    let overexposedCount = 0;
    let underexposedCount = 0;

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[p] = lum;
      lumSum += lum;
      lumSqSum += lum * lum;
      if (lum > 245) overexposedCount++;
      if (lum < 25) underexposedCount++;
    }

    const meanBrightness = lumSum / totalPixels;
    const contrastVariance = Math.max(0, lumSqSum / totalPixels - meanBrightness * meanBrightness);
    const contrastStdDev = Math.sqrt(contrastVariance);
    const overexposedRatio = overexposedCount / totalPixels;
    const underexposedRatio = underexposedCount / totalPixels;

    if (
      meanBrightness < cfg.minBrightness ||
      meanBrightness > cfg.maxBrightness ||
      overexposedRatio > cfg.maxOverexposedRatio ||
      underexposedRatio > cfg.maxUnderexposedRatio ||
      contrastStdDev < cfg.minContrastStdDev
    ) {
      return {
        ok: false,
        reason: "lighting",
        message: "Poor Lighting",
        metrics: { meanBrightness, contrastStdDev, overexposedRatio, underexposedRatio },
      };
    }

    let lapSum = 0;
    let lapSqSum = 0;
    const count = (w - 2) * (h - 2);
    if (count <= 0) {
      return { ok: false, reason: "blur", message: "Image Blurry" };
    }

    for (let row = 1; row < h - 1; row++) {
      for (let col = 1; col < w - 1; col++) {
        const idx = row * w + col;
        const val =
          gray[idx - w] +
          gray[idx - 1] -
          4 * gray[idx] +
          gray[idx + 1] +
          gray[idx + w];
        lapSum += val;
        lapSqSum += val * val;
      }
    }

    const lapMean = lapSum / count;
    const blurVariance = lapSqSum / count - lapMean * lapMean;

    if (!Number.isFinite(blurVariance) || blurVariance < cfg.minBlurVariance) {
      return {
        ok: false,
        reason: "blur",
        message: "Image Blurry",
        metrics: { blurVariance, meanBrightness, contrastStdDev },
      };
    }

    return {
      ok: true,
      metrics: { blurVariance, meanBrightness, contrastStdDev },
    };
  } catch {
    // Fail closed: never return a passing score on error
    return { ok: false, reason: "blur", message: "Image Blurry" };
  }
}

function avgPoint(pts) {
  const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / pts.length, y: sum.y / pts.length };
}

/**
 * Evaluates all face detections, frame visibility, 3-axis head pose (yaw, pitch, roll),
 * and image quality.
 */
export function evaluateFaceDetections({
  detections,
  frameWidth,
  frameHeight,
  evalCtx = null,
  cfg = FACE_VALIDATION_CONFIG,
}) {
  if (!Array.isArray(detections) || detections.length === 0) {
    return { ok: false, message: "Detecting Face" };
  }

  if (detections.length > 1) {
    return { ok: false, message: "Multiple Faces Detected" };
  }

  const det = detections[0];
  const box = det?.detection?.box;
  const landmarks = det?.landmarks;
  if (!box || !landmarks || frameWidth <= 0 || frameHeight <= 0) {
    return { ok: false, message: "Detecting Face" };
  }

  // 1. Minimum face resolution & distance checks
  if (box.width < cfg.minFacePixels || box.height < cfg.minFacePixels) {
    return { ok: false, message: "Move Closer" };
  }
  const heightRatio = box.height / frameHeight;
  const widthRatio = box.width / frameWidth;
  if (heightRatio > cfg.maxHeightRatio || widthRatio > cfg.maxWidthRatio) {
    return { ok: false, message: "Move Farther Away" };
  }
  if (heightRatio < cfg.minHeightRatio) {
    return { ok: false, message: "Move Closer" };
  }

  // 2. Complete bounding box & edge margin check
  const marginX = frameWidth * cfg.edgeMarginRatio;
  const marginY = frameHeight * cfg.edgeMarginRatio;
  if (
    box.x < marginX ||
    box.y < marginY ||
    box.x + box.width > frameWidth - marginX ||
    box.y + box.height > frameHeight - marginY
  ) {
    return { ok: false, message: "Face Not Fully Visible" };
  }

  // Center guide check
  const centerXRatio = (box.x + box.width / 2) / frameWidth;
  const centerYRatio = (box.y + box.height / 2) / frameHeight;
  if (centerXRatio < 0.20 || centerXRatio > 0.80 || centerYRatio < 0.15 || centerYRatio > 0.85) {
    return { ok: false, message: "Face Not Fully Visible" };
  }

  // 3. Landmark visibility & 3-axis Head Pose (Roll, Yaw, Pitch)
  const leftEyePts = landmarks.getLeftEye();
  const rightEyePts = landmarks.getRightEye();
  const nosePts = landmarks.getNose();
  const mouthPts = landmarks.getMouth();

  if (!leftEyePts?.length || !rightEyePts?.length || !nosePts?.length || !mouthPts?.length) {
    return { ok: false, message: "Face Not Fully Visible" };
  }

  const allKeyPts = [...leftEyePts, ...rightEyePts, ...nosePts, ...mouthPts];
  for (const pt of allKeyPts) {
    if (pt.x < 0 || pt.y < 0 || pt.x > frameWidth || pt.y > frameHeight) {
      return { ok: false, message: "Face Not Fully Visible" };
    }
  }

  const leftEye = avgPoint(leftEyePts);
  const rightEye = avgPoint(rightEyePts);
  const noseTip = nosePts[3] || avgPoint(nosePts);
  const mouthCenter = avgPoint(mouthPts);

  const eyeDx = rightEye.x - leftEye.x;
  const eyeDy = rightEye.y - leftEye.y;
  const eyeDist = Math.hypot(eyeDx, eyeDy);
  if (eyeDist < 12) {
    return { ok: false, message: "Face Not Fully Visible" };
  }

  // Roll (head tilt)
  const rollDeg = Math.abs((Math.atan2(eyeDy, eyeDx) * 180) / Math.PI);
  if (rollDeg > cfg.maxRollDegrees) {
    return { ok: false, message: "Look Straight" };
  }

  // Yaw (sideways rotation)
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const yawOffset = Math.abs(noseTip.x - eyeMidX) / eyeDist;
  const distLeft = Math.abs(noseTip.x - leftEye.x);
  const distRight = Math.abs(rightEye.x - noseTip.x);
  const symmetryRatio =
    distLeft > 0 && distRight > 0 ? Math.max(distLeft, distRight) / Math.min(distLeft, distRight) : 99;

  if (yawOffset > cfg.maxYawOffset || symmetryRatio > cfg.maxSymmetryRatio) {
    return { ok: false, message: "Look Straight" };
  }

  // Pitch (looking downward or upward)
  const faceSpanY = mouthCenter.y - eyeMidY;
  if (faceSpanY <= 10) {
    return { ok: false, message: "Face Not Fully Visible" };
  }
  const pitchRatio = (noseTip.y - eyeMidY) / faceSpanY;
  if (pitchRatio > cfg.maxPitchRatio) {
    return { ok: false, message: "Look Up" };
  }
  if (pitchRatio < cfg.minPitchRatio) {
    return { ok: false, message: "Look Down" };
  }

  // 4. Image Quality (blur, brightness, contrast, over/underexposure)
  if (evalCtx) {
    const quality = analyzeFaceImageQuality(evalCtx, box.x, box.y, box.width, box.height, cfg);
    if (!quality.ok) {
      return { ok: false, message: quality.message };
    }
  }

  return { ok: true, message: "Face Aligned – Ready to Capture" };
}
