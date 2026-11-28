import React, { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import CameraViewOverlay from "../../components/CameraViewOverlay";
import LocationDisplay from "../../components/LocationDisplay";
import { acquireBestMobileGpsPosition } from "../../services/locationService";
import { WebView } from "react-native-webview";
import { 
  Camera, 
  MapPin, 
  Clock3, 
  ShieldCheck, 
  AlertTriangle, 
  X, 
  CheckCircle2, 
  Timer 
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const HTML_CONTENT = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Realtime Face Verification</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: black;
      overflow: hidden;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1); /* Mirror effect for front camera */
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js" onerror="this.onerror=null;this.src='https://unpkg.com/@vladmandic/face-api/dist/face-api.js';"></script>
</head>
<body>
  <video id="webcam" autoplay playsinline muted></video>
  <script>
    const video = document.getElementById('webcam');
    let modelsLoaded = false;
    let detectionInterval = null;
    let streamRef = null;
    let isDetecting = false;
    let isCapturing = false;
    let stableFrames = 0;
    const evalCanvas = document.createElement('canvas');
    const outputCanvas = document.createElement('canvas');

    const CFG = {
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

    const analyzeFaceImageQuality = (ctx, x, y, width, height) => {
      try {
        const canvasWidth = ctx.canvas.width;
        const canvasHeight = ctx.canvas.height;
        const cropX = Math.max(0, Math.floor(x));
        const cropY = Math.max(0, Math.floor(y));
        const cropWidth = Math.min(canvasWidth - cropX, Math.floor(width));
        const cropHeight = Math.min(canvasHeight - cropY, Math.floor(height));

        if (cropWidth <= 8 || cropHeight <= 8) {
          return { ok: false, message: 'Face Not Fully Visible' };
        }

        const imgData = ctx.getImageData(cropX, cropY, cropWidth, cropHeight);
        const data = imgData.data;
        const w = imgData.width;
        const h = imgData.height;
        const totalPixels = w * h;

        const gray = new Float32Array(totalPixels);
        let lumSum = 0;
        let lumSqSum = 0;
        let overexposed = 0;
        let underexposed = 0;

        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          gray[p] = lum;
          lumSum += lum;
          lumSqSum += lum * lum;
          if (lum > 245) overexposed++;
          if (lum < 25) underexposed++;
        }

        const meanBrightness = lumSum / totalPixels;
        const contrastStdDev = Math.sqrt(Math.max(0, lumSqSum / totalPixels - meanBrightness * meanBrightness));
        if (
          meanBrightness < CFG.minBrightness ||
          meanBrightness > CFG.maxBrightness ||
          overexposed / totalPixels > CFG.maxOverexposedRatio ||
          underexposed / totalPixels > CFG.maxUnderexposedRatio ||
          contrastStdDev < CFG.minContrastStdDev
        ) {
          return { ok: false, message: 'Poor Lighting' };
        }

        let lapSum = 0;
        let lapSqSum = 0;
        const count = (w - 2) * (h - 2);
        if (count <= 0) return { ok: false, message: 'Image Blurry' };

        for (let row = 1; row < h - 1; row++) {
          for (let col = 1; col < w - 1; col++) {
            const idx = row * w + col;
            const val = gray[idx - w] + gray[idx - 1] - 4 * gray[idx] + gray[idx + 1] + gray[idx + w];
            lapSum += val;
            lapSqSum += val * val;
          }
        }

        const lapMean = lapSum / count;
        const variance = lapSqSum / count - lapMean * lapMean;
        if (!Number.isFinite(variance) || variance < CFG.minBlurVariance) {
          return { ok: false, message: 'Image Blurry' };
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, message: 'Image Blurry' };
      }
    };

    const avgPt = (pts) => {
      const s = pts.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
      return { x: s.x / pts.length, y: s.y / pts.length };
    };

    const evaluateFaceDetections = (detections, frameWidth, frameHeight, evalCtx) => {
      if (!Array.isArray(detections) || detections.length === 0) {
        return { ok: false, message: 'Detecting Face' };
      }
      if (detections.length > 1) {
        return { ok: false, message: 'Multiple Faces Detected' };
      }
      const det = detections[0];
      const box = det?.detection?.box;
      const landmarks = det?.landmarks;
      if (!box || !landmarks || frameWidth <= 0 || frameHeight <= 0) {
        return { ok: false, message: 'Detecting Face' };
      }
      if (box.width < CFG.minFacePixels || box.height < CFG.minFacePixels) {
        return { ok: false, message: 'Move Closer' };
      }
      const heightRatio = box.height / frameHeight;
      const widthRatio = box.width / frameWidth;
      if (heightRatio > CFG.maxHeightRatio || widthRatio > CFG.maxWidthRatio) {
        return { ok: false, message: 'Move Farther Away' };
      }
      if (heightRatio < CFG.minHeightRatio) {
        return { ok: false, message: 'Move Closer' };
      }

      const marginX = frameWidth * CFG.edgeMarginRatio;
      const marginY = frameHeight * CFG.edgeMarginRatio;
      if (
        box.x < marginX ||
        box.y < marginY ||
        box.x + box.width > frameWidth - marginX ||
        box.y + box.height > frameHeight - marginY
      ) {
        return { ok: false, message: 'Face Not Fully Visible' };
      }

      const centerXRatio = (box.x + box.width / 2) / frameWidth;
      const centerYRatio = (box.y + box.height / 2) / frameHeight;
      if (centerXRatio < 0.20 || centerXRatio > 0.80 || centerYRatio < 0.15 || centerYRatio > 0.85) {
        return { ok: false, message: 'Face Not Fully Visible' };
      }

      const leftEyePts = landmarks.getLeftEye();
      const rightEyePts = landmarks.getRightEye();
      const nosePts = landmarks.getNose();
      const mouthPts = landmarks.getMouth();
      if (!leftEyePts?.length || !rightEyePts?.length || !nosePts?.length || !mouthPts?.length) {
        return { ok: false, message: 'Face Not Fully Visible' };
      }
      const allKeyPts = [...leftEyePts, ...rightEyePts, ...nosePts, ...mouthPts];
      for (const pt of allKeyPts) {
        if (pt.x < 0 || pt.y < 0 || pt.x > frameWidth || pt.y > frameHeight) {
          return { ok: false, message: 'Face Not Fully Visible' };
        }
      }

      const leftEye = avgPt(leftEyePts);
      const rightEye = avgPt(rightEyePts);
      const noseTip = nosePts[3] || avgPt(nosePts);
      const mouthCenter = avgPt(mouthPts);

      const eyeDx = rightEye.x - leftEye.x;
      const eyeDy = rightEye.y - leftEye.y;
      const eyeDist = Math.hypot(eyeDx, eyeDy);
      if (eyeDist < 12) return { ok: false, message: 'Face Not Fully Visible' };

      const rollDeg = Math.abs((Math.atan2(eyeDy, eyeDx) * 180) / Math.PI);
      if (rollDeg > CFG.maxRollDegrees) return { ok: false, message: 'Look Straight' };

      const eyeMidX = (leftEye.x + rightEye.x) / 2;
      const eyeMidY = (leftEye.y + rightEye.y) / 2;
      const yawOffset = Math.abs(noseTip.x - eyeMidX) / eyeDist;
      const distLeft = Math.abs(noseTip.x - leftEye.x);
      const distRight = Math.abs(rightEye.x - noseTip.x);
      const symmetryRatio = distLeft > 0 && distRight > 0 ? Math.max(distLeft, distRight) / Math.min(distLeft, distRight) : 99;
      if (yawOffset > CFG.maxYawOffset || symmetryRatio > CFG.maxSymmetryRatio) {
        return { ok: false, message: 'Look Straight' };
      }

      const faceSpanY = mouthCenter.y - eyeMidY;
      if (faceSpanY <= 10) return { ok: false, message: 'Face Not Fully Visible' };
      const pitchRatio = (noseTip.y - eyeMidY) / faceSpanY;
      if (pitchRatio > CFG.maxPitchRatio) return { ok: false, message: 'Look Up' };
      if (pitchRatio < CFG.minPitchRatio) return { ok: false, message: 'Look Down' };

      const quality = analyzeFaceImageQuality(evalCtx, box.x, box.y, box.width, box.height);
      if (!quality.ok) return { ok: false, message: quality.message };

      return { ok: true, message: 'Face Aligned – Ready to Capture' };
    };

    const sendMsg = (payload) => {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    };

    const loadModels = async () => {
      const modelMirrors = [
        "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/",
        "https://unpkg.com/@vladmandic/face-api/model/"
      ];
      let loaded = false;
      let lastErr = null;

      for (const mirrorUrl of modelMirrors) {
        try {
          await Promise.race([
            Promise.all([
              faceapi.nets.tinyFaceDetector.loadFromUri(mirrorUrl),
              faceapi.nets.faceLandmark68Net.loadFromUri(mirrorUrl),
            ]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout loading models from ' + mirrorUrl)), 12000))
          ]);
          loaded = true;
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      if (loaded) {
        modelsLoaded = true;
        sendMsg({ type: 'MODELS_LOADED' });
      } else {
        sendMsg({ type: 'ERROR', error: 'Failed to load face detector models: ' + (lastErr?.message || 'Network unreachable') });
      }
    };

    const startCamera = async () => {
      try {
        if (streamRef) {
          streamRef.getTracks().forEach(track => track.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false
        });
        streamRef = stream;
        video.srcObject = stream;
        try {
          await video.play();
        } catch (e) {
          console.error("Video play error:", e);
        }
        startDetectionLoop();
      } catch (err) {
        sendMsg({ type: 'ERROR', error: 'Failed to access camera: ' + err.message });
      }
    };

    const stopCamera = () => {
      stableFrames = 0;
      isDetecting = false;
      isCapturing = false;
      if (streamRef) {
        streamRef.getTracks().forEach(track => track.stop());
        streamRef = null;
      }
      if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
      }
    };

    window.addEventListener('beforeunload', stopCamera);

    const startDetectionLoop = () => {
      if (detectionInterval) clearInterval(detectionInterval);
      stableFrames = 0;

      detectionInterval = setInterval(async () => {
        if (isDetecting || isCapturing || !modelsLoaded || video.paused || video.ended || video.videoWidth === 0 || video.videoHeight === 0) return;
        isDetecting = true;

        try {
          if (evalCanvas.width !== video.videoWidth) evalCanvas.width = video.videoWidth;
          if (evalCanvas.height !== video.videoHeight) evalCanvas.height = video.videoHeight;
          const evalCtx = evalCanvas.getContext('2d', { willReadFrequently: true });
          evalCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

          const detections = await faceapi
            .detectAllFaces(evalCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: CFG.inputSize, scoreThreshold: CFG.scoreThreshold }))
            .withFaceLandmarks();

          const res = evaluateFaceDetections(detections, video.videoWidth, video.videoHeight, evalCtx);
          if (!res.ok) {
            stableFrames = 0;
            sendMsg({ type: 'VALIDATION_STATUS', isValid: false, message: res.message });
            return;
          }

          stableFrames += 1;
          if (stableFrames < CFG.requiredStableFrames) {
            sendMsg({ type: 'VALIDATION_STATUS', isValid: false, message: 'Hold Still' });
            return;
          }

          sendMsg({
            type: 'VALIDATION_STATUS',
            isValid: true,
            message: 'Face Aligned – Ready to Capture'
          });
        } catch (err) {
          stableFrames = 0;
          console.error("Detection error:", err);
        } finally {
          isDetecting = false;
        }
      }, 400);
    };

    const captureFrame = async () => {
      if (isCapturing) return;
      isCapturing = true;
      try {
        if (!modelsLoaded || video.paused || video.ended || video.videoWidth === 0 || video.videoHeight === 0) {
          throw new Error('Camera is not ready.');
        }
        if (evalCanvas.width !== video.videoWidth) evalCanvas.width = video.videoWidth;
        if (evalCanvas.height !== video.videoHeight) evalCanvas.height = video.videoHeight;
        const evalCtx = evalCanvas.getContext('2d', { willReadFrequently: true });
        evalCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

        const detections = await faceapi
          .detectAllFaces(evalCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: CFG.inputSize, scoreThreshold: CFG.scoreThreshold }))
          .withFaceLandmarks();
        const check = evaluateFaceDetections(detections, video.videoWidth, video.videoHeight, evalCtx);
        if (!check.ok) {
          stableFrames = 0;
          sendMsg({ type: 'CAPTURE_FAILED', error: check.message });
          return;
        }

        if (outputCanvas.width !== video.videoWidth) outputCanvas.width = video.videoWidth;
        if (outputCanvas.height !== video.videoHeight) outputCanvas.height = video.videoHeight;
        const outCtx = outputCanvas.getContext('2d');
        outCtx.save();
        outCtx.translate(outputCanvas.width, 0);
        outCtx.scale(-1, 1);
        outCtx.drawImage(evalCanvas, 0, 0);
        outCtx.restore();

        const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.9);
        const base64 = dataUrl.split(',')[1];
        sendMsg({ type: 'CAPTURE_SUCCESS', base64: base64 });
      } catch (err) {
        sendMsg({ type: 'CAPTURE_FAILED', error: 'Capture error: ' + err.message });
      } finally {
        isCapturing = false;
      }
    };

    window.addEventListener("message", async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'START_CAMERA') {
          await startCamera();
        } else if (payload.type === 'STOP_CAMERA') {
          stopCamera();
        } else if (payload.type === 'CAPTURE') {
          captureFrame();
        }
      } catch (err) {
        sendMsg({ type: 'ERROR', error: 'WebView parse error: ' + err.message });
      }
    });

    document.addEventListener("message", async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'START_CAMERA') {
          await startCamera();
        } else if (payload.type === 'STOP_CAMERA') {
          stopCamera();
        } else if (payload.type === 'CAPTURE') {
          captureFrame();
        }
      } catch (err) {
        sendMsg({ type: 'ERROR', error: 'WebView parse error: ' + err.message });
      }
    });

    // Run initialization
    loadModels();
  </script>
</body>
</html>
`;

export default function PunchScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);

  const [activeLoading, setActiveLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [punchType, setPunchType] = useState<"in" | "out" | null>(null);
  const [activePunch, setActivePunch] = useState<any>(null);
  const [elapsedTime, setElapsedTime] = useState("");
  const [currentCoords, setCurrentCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  } | null>(null);
  const gpsCancelRef = useRef<{ aborted: boolean }>({ aborted: false });

  // WebView Face API References and States
  const webViewRef = useRef<any>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [validationMsg, setValidationMsg] = useState("Initializing face detector...");
  const [validationStatus, setValidationStatus] = useState<"neutral" | "loading" | "success" | "error">("loading");

  const pendingCoordsRef = useRef<any>(null);

  // Fetch status of the current day
  const fetchStatus = async () => {
    try {
      const res = await api.get("/attendance/status/");
      setActivePunch(res.data);
    } catch (err) {
      console.error("Error fetching punch status:", err);
    } finally {
      setActiveLoading(false);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === "granted");
    } catch (e) {
      console.error("Error requesting location permission", e);
      setLocationPermission(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchStatus();
      void requestLocationPermission();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Hook up live updates
  useRealtime("attendance_update", fetchStatus);
  useRealtime("leave_update", fetchStatus);
  useRealtime("realtime:connected", fetchStatus);

  // Synchronize camera state with WebView reactively to avoid race conditions
  useEffect(() => {
    if (cameraOn && isModelLoaded) {
      webViewRef.current?.postMessage(
        JSON.stringify({
          type: "START_CAMERA",
        })
      );
    } else if (!cameraOn) {
      webViewRef.current?.postMessage(
        JSON.stringify({
          type: "STOP_CAMERA",
        })
      );
    }
  }, [cameraOn, isModelLoaded]);

  // Calculate elapsed time timer
  useEffect(() => {
    if (
      !activePunch?.is_punched_in ||
      !activePunch.punch_in_time ||
      activePunch.punch_in_status !== "approved"
    ) {
      const t = setTimeout(() => setElapsedTime(""), 0);
      return () => clearTimeout(t);
    }

    const punchInDate = new Date(activePunch.punch_in_time).getTime();

    const updateTimer = () => {
      const diffMs = Date.now() - punchInDate;
      if (diffMs < 0) {
        setElapsedTime("00:00:00");
        return;
      }
      const diffSecs = Math.floor(diffMs / 1000);
      const hours = String(Math.floor(diffSecs / 3600)).padStart(2, "0");
      const minutes = String(Math.floor((diffSecs % 3600) / 60)).padStart(2, "0");
      const seconds = String(diffSecs % 60).padStart(2, "0");
      setElapsedTime(`${hours}:${minutes}:${seconds}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [activePunch]);

  const startPunchWorkflow = async (type: "in" | "out") => {
    if (!cameraPermission || !cameraPermission.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        Alert.alert("Permission Required", "Camera permission is required to capture verification selfies.");
        return;
      }
    }

    if (locationPermission !== true) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Location permission is required to check geofence boundary rules.");
        return;
      }
      setLocationPermission(true);
    }

    setPunchType(type);
    setCameraOn(true);

    // Reset face verification state
    setValidationStatus(isModelLoaded ? "neutral" : "loading");
    setValidationMsg(isModelLoaded ? "Center your face within the oval" : "Initializing face detector...");

    gpsCancelRef.current.aborted = true;
    const cancelToken = { aborted: false };
    gpsCancelRef.current = cancelToken;

    try {
      const loc = await acquireBestMobileGpsPosition({
        targetAccuracy: 25,
        timeoutMs: 7000,
        cancelToken,
        onSample: (sample) => {
          setCurrentCoords({
            latitude: sample.latitude,
            longitude: sample.longitude,
            accuracy: sample.accuracy,
          });
        },
      });
      setCurrentCoords({
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
      });
    } catch (e: any) {
      if (!cancelToken.aborted) {
        console.error("Error fetching current position", e);
        Alert.alert("Location Failure", e?.message || "Could not capture high-accuracy GPS coordinates.");
      }
    }
  };

  const cancelPunch = () => {
    gpsCancelRef.current.aborted = true;
    setCameraOn(false);
    setPunchType(null);
    setCurrentCoords(null);
    setValidationStatus("neutral");
    pendingCoordsRef.current = null;
  };

  const handleCaptureAndSubmit = async () => {
    if (submitting) return;
    if (validationStatus !== "success") {
      Alert.alert("Face Alignment Required", "Please hold still and align your face inside the oval until it turns green.");
      return;
    }

    setSubmitting(true);
    // 1. Immediately capture & validate the exact current frame BEFORE awaiting GPS
    webViewRef.current?.postMessage(
      JSON.stringify({
        type: "CAPTURE",
      })
    );
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log("[WebView FaceAPI]", data.type, data.success ?? "", data.error ?? "");

      switch (data.type) {
        case "MODELS_LOADED":
          setIsModelLoaded(true);
          setValidationStatus("neutral");
          setValidationMsg("Center your face within the oval");
          break;

        case "ERROR":
          console.error("WebView Model Loading Error:", data.error);
          setIsModelLoaded(false);
          setValidationStatus("error");
          setValidationMsg("Face detector failed to load");
          break;

        case "VALIDATION_STATUS":
          setValidationStatus(data.isValid ? "success" : "error");
          setValidationMsg(data.message || "Positioning face...");
          break;

        case "CAPTURE_SUCCESS":
          await processAndUploadCapturedSelfie(data.base64);
          break;

        case "CAPTURE_FAILED":
          Alert.alert("Capture Failed", data.error || "Failed to capture selfie frame.");
          setSubmitting(false);
          setValidationStatus("error");
          setValidationMsg("Frame capture failed. Try again.");
          break;

        default:
          break;
      }
    } catch (err) {
      console.error("Failed to parse WebView message:", err);
    }
  };

  const processAndUploadCapturedSelfie = async (base64Data: string) => {
    let tempUri: string | null = null;
    gpsCancelRef.current.aborted = true;
    const cancelToken = { aborted: false };
    gpsCancelRef.current = cancelToken;

    try {
      // 1. Freeze the already-validated frame into an immutable local file first
      tempUri = `${FileSystem.cacheDirectory}selfie_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(tempUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setValidationMsg("Face captured successfully.");

      // 2. Acquire fresh converged high-accuracy GPS AFTER the frame is frozen
      const loc = await acquireBestMobileGpsPosition({
        targetAccuracy: 25,
        timeoutMs: 7000,
        cancelToken,
      });

      if (loc.accuracy != null && loc.accuracy > 100) {
        Alert.alert(
          "Weak GPS Accuracy",
          `Your GPS accuracy is ±${Math.round(loc.accuracy)}m. Required accuracy is within 100 meters. Please move to an open area or enable precise location.`
        );
        setSubmitting(false);
        return;
      }

      const coords = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
        timestamp: loc.timestamp,
        provider: loc.provider,
      };
      pendingCoordsRef.current = coords;

      const formData = new FormData();
      formData.append("latitude", String(coords.latitude));
      formData.append("longitude", String(coords.longitude));
      if (coords.accuracy != null) {
        formData.append("accuracy", String(coords.accuracy));
      }
      if (coords.timestamp != null) {
        formData.append("location_timestamp", String(coords.timestamp));
      }
      if (coords.provider) {
        formData.append("location_provider", String(coords.provider));
      }
      formData.append("photo", {
        uri: tempUri,
        name: `selfie_${Date.now()}.jpg`,
        type: "image/jpeg",
      } as any);

      const url = punchType === "in" ? "/attendance/punch-in/" : "/attendance/punch-out/";
      const res = await api.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      Alert.alert("Punch Success", res.data.message || "Attendance log updated successfully.");
      setCameraOn(false);
      setPunchType(null);
      setCurrentCoords(null);
      fetchStatus();
    } catch (err: any) {
      console.error("Punch request failed", err);
      const errMsg = err.response?.data?.error || err.message || "Failed to submit attendance.";
      Alert.alert("Punch Rejected", errMsg);
      setValidationStatus("error");
      setValidationMsg("Punch Rejected: " + (err.response?.data?.error || "Server error"));
    } finally {
      // Clean up temporary selfie cache file to prevent cache storage leak
      if (tempUri) {
        FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      }
      setSubmitting(false);
      pendingCoordsRef.current = null;
    }
  };

  if (activeLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  // --- RENDERING VIEWS CONTAINER (with preserved WebView context) ---
  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      {/* Persistent Single WebView instance: sits fullscreen in background when cameraOn is true, and offscreen when false */}
      <View
        style={
          cameraOn
            ? [StyleSheet.absoluteFill, { zIndex: 1 }]
            : { position: "absolute", top: -9999, left: -9999, width: 1, height: 1, opacity: 0 }
        }
      >
        <WebView
          ref={webViewRef}
          source={{ html: HTML_CONTENT, baseUrl: "https://localhost" }}
          onMessage={handleWebViewMessage}
          style={{ flex: 1, backgroundColor: "black" }}
          containerStyle={{ backgroundColor: "transparent" }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={["*"]}
          onPermissionRequest={(event: any) => {
            event.grant(event.resources);
          }}
        />
      </View>

      {cameraOn ? (
        <SafeAreaView style={[styles.cameraContainer, { zIndex: 2 }]}>
          <View style={StyleSheet.absoluteFill}>
            <CameraViewOverlay message={validationMsg} status={validationStatus} />

            {/* Top Panel */}
            <View style={styles.cameraHeader}>
              <TouchableOpacity style={styles.closeButton} onPress={cancelPunch}>
                <X size={20} color="#ffffff" />
              </TouchableOpacity>
              <Text style={styles.cameraHeaderTitle}>
                {punchType === "in" ? "Checking In" : "Checking Out"}
              </Text>
            </View>

            {/* Bottom Panel */}
            <View style={styles.cameraFooter}>
              {currentCoords ? (
                <View style={styles.gpsRow}>
                  <LocationDisplay
                    latitude={currentCoords.latitude}
                    longitude={currentCoords.longitude}
                    suffix={
                      currentCoords.accuracy != null
                        ? `(±${Math.round(currentCoords.accuracy)}m)`
                        : ""
                    }
                    dark
                    compact
                    showMapLink={false}
                    iconColor="#10b981"
                  />
                </View>
              ) : (
                <View style={styles.gpsRow}>
                  <ActivityIndicator size="small" color="#94a3b8" />
                  <Text style={styles.gpsTextWaiting}>Acquiring high accuracy GPS...</Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.captureButton,
                  (submitting || !isModelLoaded || validationStatus !== "success") && styles.disabledBtn,
                ]}
                onPress={handleCaptureAndSubmit}
                disabled={submitting || !isModelLoaded || validationStatus !== "success"}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : !isModelLoaded ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.captureButtonText}>Loading face model...</Text>
                  </View>
                ) : (
                  <Text style={styles.captureButtonText}>Verify & Punch</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      ) : (
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.container}>
            {/* Info Header */}
            <View style={styles.heroSection}>
              <Text style={styles.heroPreText}>
                <ShieldCheck size={12} color="#10b981" /> Secure Telemetry
              </Text>
              <Text style={styles.heroTitle}>Smart Punch Desk</Text>
              <Text style={styles.heroDesc}>
                Verify your identity and perimeter location using face scanning and GPS logging.
              </Text>
            </View>

            {/* Dynamic Status Blocks */}
            {activePunch?.on_leave ? (
              <View style={[styles.statusBlock, styles.blockLeave]}>
                <AlertTriangle size={32} color="#f43f5e" />
                <Text style={[styles.statusTitle, styles.textLeave]}>On Approved Leave</Text>
                <Text style={styles.statusDesc}>
                  Your roster is marked on active leave. You can check back once your leave completes.
                </Text>
              </View>
            ) : activePunch?.is_punch_out_pending ? (
              <View style={[styles.statusBlock, styles.blockPending]}>
                <AlertTriangle size={32} color="#f59e0b" />
                <Text style={[styles.statusTitle, styles.textPending]}>Punch Out Pending Approval</Text>
                <Text style={styles.statusDesc}>
                  Workday will close once your punch out is approved by your reviewer.
                </Text>
              </View>
            ) : (activePunch?.is_punched_in && activePunch?.punch_in_status !== "leave" && Boolean(activePunch?.punch_in_time)) ? (
              activePunch.punch_in_status === "approved" ? (
                <View style={[styles.statusBlock, styles.blockActive]}>
                  <CheckCircle2 size={32} color="#10b981" />
                  <Text style={[styles.statusTitle, styles.textActive]}>Checked In Successfully</Text>
                  <Text style={styles.statusDesc}>Your current workday session is active.</Text>

                  {elapsedTime !== "" && (
                    <View style={styles.timerRow}>
                      <Timer size={20} color="#10b981" />
                      <Text style={styles.timerText}>{elapsedTime}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.punchButton, styles.punchOutBtn]}
                    onPress={() => startPunchWorkflow("out")}
                  >
                    <Camera size={18} color="#ffffff" style={styles.btnIcon} />
                    <Text style={styles.punchBtnText}>Punch Out</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.statusBlock, styles.blockPending]}>
                  <AlertTriangle size={32} color="#f59e0b" />
                  <Text style={[styles.statusTitle, styles.textPending]}>Punch In Pending Approval</Text>
                  <Text style={styles.statusDesc}>
                    Timer will start and your workday will activate once your punch in is approved.
                  </Text>

                  <TouchableOpacity
                    style={[styles.punchButton, styles.punchOutBtn, styles.disabledBtn, { opacity: 0.5 }]}
                    disabled={true}
                  >
                    <Camera size={18} color="#ffffff" style={styles.btnIcon} />
                    <Text style={styles.punchBtnText}>Punch Out (Blocked)</Text>
                  </TouchableOpacity>
                </View>
              )
            ) : (
              <View style={[styles.statusBlock, styles.blockStandby]}>
                <Clock3 size={32} color="#94a3b8" />
                <Text style={styles.statusTitle}>Not Checked In</Text>
                <Text style={styles.statusDesc}>Start your shift. Position yourself within your workplace geofence.</Text>

                <TouchableOpacity
                  style={[styles.punchButton, styles.punchInBtn]}
                  onPress={() => startPunchWorkflow("in")}
                >
                  <Camera size={18} color="#ffffff" style={styles.btnIcon} />
                  <Text style={styles.punchBtnText}>Punch In</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F8FC",
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F6F8FC",
    alignItems: "center",
    justifyContent: "center",
  },
  heroSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  heroPreText: {
    color: "#2457D6",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroTitle: {
    color: "#152238",
    fontSize: 22,
    fontWeight: "800",
  },
  heroDesc: {
    color: "#68758A",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  // Status Cards
  statusBlock: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  blockLeave: {
    borderColor: "#FECDD3",
  },
  blockPending: {
    borderColor: "#FDE68A",
  },
  blockActive: {
    borderColor: "#BBF7D0",
  },
  blockStandby: {
    borderColor: "#E5EAF2",
  },
  statusTitle: {
    color: "#152238",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
    textAlign: "center",
  },
  textLeave: {
    color: "#BE123C",
  },
  textPending: {
    color: "#B45309",
  },
  textActive: {
    color: "#15803D",
  },
  statusDesc: {
    color: "#68758A",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 24,
  },
  timerText: {
    color: "#2457D6",
    fontSize: 22,
    fontWeight: "700",
    marginLeft: 10,
    fontFamily: "System",
  },
  // Punch Buttons
  punchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
  },
  punchInBtn: {
    backgroundColor: "#10b981",
  },
  punchOutBtn: {
    backgroundColor: "#ef4444",
  },
  punchBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  btnIcon: {
    marginRight: 8,
  },
  // Camera Panel Styles
  cameraContainer: {
    flex: 1,
    backgroundColor: "transparent",
  },
  cameraHeader: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  closeButton: {
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    padding: 10,
    borderRadius: 20,
  },
  cameraHeaderTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 16,
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  cameraFooter: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  gpsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#33415550",
  },
  gpsText: {
    color: "#10b981",
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 6,
  },
  gpsTextWaiting: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 6,
  },
  captureButton: {
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: "#34d39950",
  },
  captureButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  disabledBtn: {
    opacity: 0.7,
  },
});
