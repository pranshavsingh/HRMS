import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock3,
  MapPinned,
  ScanFace,
  ShieldCheck,
  TimerReset,
  XCircle,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import API from "../api/axios";
import axios from "axios";
import { usePopup } from "../context/PopupContext";
import { useRealtime } from "../context/RealtimeContext";
import * as faceapi from "@vladmandic/face-api";

let faceModelsPromise = null;

const loadFaceModels = () => {
  if (!faceModelsPromise) {
    const modelUrl = "/models/face-api/";
    faceModelsPromise = (async () => {
      const tf = faceapi.tf;
      let backendReady = await tf.setBackend("webgl");
      if (!backendReady) backendReady = await tf.setBackend("cpu");
      if (!backendReady) throw new Error("No supported TensorFlow browser backend is available.");
      await tf.ready();

      await Promise.all([
        faceapi.nets.tinyFaceDetector.isLoaded
          ? Promise.resolve()
          : faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
        faceapi.nets.faceLandmark68Net.isLoaded
          ? Promise.resolve()
          : faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
      ]);
    })().catch((error) => {
      faceModelsPromise = null;
      throw error;
    });
  }

  return faceModelsPromise;
};

const formatCoordinate = (value) =>
  value === null || value === undefined ? "--" : Number(value).toFixed(6);

const formatDate = (dateStr) => {
  if (!dateStr) return "--";
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

const checkBlurriness = (ctx, x, y, width, height) => {
  try {
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    const cropX = Math.max(0, Math.floor(x));
    const cropY = Math.max(0, Math.floor(y));
    const cropWidth = Math.min(canvasWidth - cropX, Math.floor(width));
    const cropHeight = Math.min(canvasHeight - cropY, Math.floor(height));

    if (cropWidth <= 4 || cropHeight <= 4) return 0;

    const imgData = ctx.getImageData(cropX, cropY, cropWidth, cropHeight);
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;

    const gray = new Float32Array(w * h);
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    let sum = 0;
    let sqSum = 0;
    const count = (w - 2) * (h - 2);
    if (count <= 0) return 0;

    for (let row = 1; row < h - 1; row++) {
      for (let col = 1; col < w - 1; col++) {
        const idx = row * w + col;
        const val =
          gray[idx - w] +
          gray[idx - 1] -
          4 * gray[idx] +
          gray[idx + 1] +
          gray[idx + w];

        sum += val;
        sqSum += val * val;
      }
    }

    const mean = sum / count;
    const variance = sqSum / count - mean * mean;
    return variance;
  } catch (e) {
    console.error("Blur check error:", e);
    return 100;
  }
};

/**
 * Robust Geolocation acquisition with explicit timeout, high accuracy, and typed Error normalization
 */
const getLocation = (customOptions = {}) => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      const err = new Error("Geolocation is not supported by your browser.");
      err.code = 2; // POSITION_UNAVAILABLE
      return reject(err);
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000, // 10 second timeout
      maximumAge: 0,
      ...customOptions,
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now(),
        });
      },
      (geoError) => {
        let message = "Unable to retrieve location.";
        if (geoError.code === 1) {
          message = "Location permission denied. Please allow location access in your browser settings to punch attendance.";
        } else if (geoError.code === 2) {
          message = "Location unavailable. Please ensure GPS or device location services are turned on.";
        } else if (geoError.code === 3) {
          message = "Location request timed out. Please check your signal and try again.";
        }
        const err = new Error(message);
        err.code = geoError.code;
        err.originalError = geoError;
        reject(err);
      },
      options
    );
  });
};

export default function Attendance() {
  const { showPopup } = usePopup();

  // Element and lifecycle references
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const isDetectingRef = useRef(false);
  const activeSessionIdRef = useRef(0);
  const modelsLoadedRef = useRef(false);

  // Camera state lifecycle: "idle" | "requesting" | "starting" | "ready" | "capturing" | "error"
  const [cameraState, setCameraState] = useState("idle");
  const [stream, setStream] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState(null); // "in" | "out"
  const [punchDetails, setPunchDetails] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Face recognition model states
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [modelErrorMessage, setModelErrorMessage] = useState("");
  const [validation, setValidation] = useState({
    isValid: false,
    message: "Initializing face detector...",
  });

  // Attendance status & duration timer
  const [activePunch, setActivePunch] = useState(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [elapsedTime, setElapsedTime] = useState("");

  const cameraOn = cameraState === "starting" || cameraState === "ready" || cameraState === "capturing";

  const fetchStatus = async () => {
    try {
      const res = await API.get("/attendance/status/");
      setActivePunch(res.data);
    } catch (err) {
      console.error("Error fetching punch status:", err);
    } finally {
      setActiveLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useRealtime("attendance_update", fetchStatus);

  // Sync ref with state to prevent stale closure in detection interval
  useEffect(() => {
    modelsLoadedRef.current = modelsLoaded;
  }, [modelsLoaded]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        await loadFaceModels();
        setModelsLoaded(true);
        modelsLoadedRef.current = true;
      } catch (err) {
        console.error("Error loading face-api models:", err);
        setModelErrorMessage(err?.message || "The local verification models could not be loaded.");
        setModelError(true);
      }
    };
    loadModels();
  }, []);

  const retryFaceModels = async () => {
    setModelError(false);
    setModelErrorMessage("");
    try {
      await loadFaceModels();
      setModelsLoaded(true);
      modelsLoadedRef.current = true;
    } catch (err) {
      console.error("Error retrying face-api models:", err);
      setModelErrorMessage(err?.message || "The local verification models could not be loaded.");
      setModelError(true);
    }
  };

  // Video ready checks
  const checkAndMarkVideoReady = useCallback(() => {
    const video = videoRef.current;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      setVideoReady(true);
      setCameraState((prev) => (prev === "starting" ? "ready" : prev));
    }
  }, []);

  const handleVideoMetadataLoaded = useCallback(() => {
    checkAndMarkVideoReady();
  }, [checkAndMarkVideoReady]);

  const handleVideoCanPlay = useCallback(() => {
    checkAndMarkVideoReady();
  }, [checkAndMarkVideoReady]);

  // Robust callback ref for video element mounting and stream binding
  const handleVideoRef = useCallback((node) => {
    videoRef.current = node;
    if (!node) return;

    const currentStream = streamRef.current;
    if (currentStream && node.srcObject !== currentStream) {
      node.srcObject = currentStream;
    }

    if (node.srcObject) {
      const playPromise = node.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("Video play() was prevented or interrupted:", err);
          }
        });
      }
    }
  }, []);

  // Secondary stream attachment effect for asynchronous render reconciliation
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("Video play() interrupted in stream effect:", err);
        }
      });
    }

    if (video.readyState >= 2 && video.videoWidth > 0) {
      setVideoReady(true);
      setCameraState((prev) => (prev === "starting" ? "ready" : prev));
    }
  }, [stream, cameraState]);

  // Face detection loop management
  const stopDetectionLoop = useCallback(() => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
    isDetectingRef.current = false;
  }, []);

  const startDetectionLoop = useCallback(() => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }

    loopRef.current = setInterval(async () => {
      // Guard against overlapping concurrent executions
      if (isDetectingRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (
        !video ||
        video.paused ||
        video.ended ||
        video.videoWidth === 0 ||
        video.videoHeight === 0 ||
        !modelsLoadedRef.current
      ) {
        return;
      }

      isDetectingRef.current = true;
      try {
        const detection = await faceapi
          .detectSingleFace(
            video,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
          )
          .withFaceLandmarks();

        if (!detection) {
          setValidation({
            isValid: false,
            message: "No face detected. Please position your face inside the frame.",
          });
          return;
        }

        const { box } = detection.detection;
        const landmarks = detection.landmarks;

        // 1. Distance Check (Face height relative to video height)
        const faceHeightRatio = box.height / video.videoHeight;
        if (faceHeightRatio > 0.40) {
          setValidation({
            isValid: false,
            message: "Too close! Move further back (maintain 12-15 inches).",
          });
          return;
        }
        if (faceHeightRatio < 0.18) {
          setValidation({
            isValid: false,
            message: "Too far! Move closer (maintain 12-15 inches).",
          });
          return;
        }

        // 2. Side Face Check (Symmetry ratio between eyes and nose)
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        const nose = landmarks.getNose();

        const leftEyeX = leftEye.reduce((sum, p) => sum + p.x, 0) / leftEye.length;
        const rightEyeX = rightEye.reduce((sum, p) => sum + p.x, 0) / rightEye.length;
        const noseX = nose.reduce((sum, p) => sum + p.x, 0) / nose.length;

        const distLeft = Math.abs(noseX - leftEyeX);
        const distRight = Math.abs(rightEyeX - noseX);

        if (distLeft === 0 || distRight === 0) {
          setValidation({
            isValid: false,
            message: "Side face detected! Please look straight at the camera.",
          });
          return;
        }

        const symmetryRatio = Math.max(distLeft, distRight) / Math.min(distLeft, distRight);
        if (symmetryRatio > 1.5) {
          setValidation({
            isValid: false,
            message: "Side face detected! Please look straight at the camera.",
          });
          return;
        }

        // 3. Blur Check (Laplacian variance of face bounding box)
        if (canvas) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0);
            const blurScore = checkBlurriness(ctx, box.x, box.y, box.width, box.height);
            if (blurScore < 35) {
              setValidation({
                isValid: false,
                message: "Image is blurry! Please hold still and ensure good lighting.",
              });
              return;
            }
          }
        }

        // All checks passed!
        setValidation({
          isValid: true,
          message: "Perfect! Face verified. Ready to capture.",
        });
      } catch (err) {
        console.error("Face detection loop error:", err);
      } finally {
        isDetectingRef.current = false;
      }
    }, 400);
  }, []);

  // Manage detection loop based on camera readiness
  useEffect(() => {
    if (cameraState === "ready" && videoReady) {
      if (!modelsLoaded) {
        setValidation({
          isValid: false,
          message: "Initializing face detector...",
        });
      } else {
        setValidation({
          isValid: false,
          message: "Position your face inside the frame.",
        });
      }
      const timer = setTimeout(() => {
        startDetectionLoop();
      }, 300);
      return () => {
        clearTimeout(timer);
        stopDetectionLoop();
      };
    } else {
      stopDetectionLoop();
    }
  }, [cameraState, videoReady, modelsLoaded, startDetectionLoop, stopDetectionLoop]);

  // Elapsed time counter for approved active shifts
  useEffect(() => {
    if (
      !activePunch?.is_punched_in ||
      !activePunch.punch_in_time ||
      activePunch.punch_in_status !== "approved"
    ) {
      setElapsedTime("");
      return;
    }

    const punchInDate = new Date(activePunch.punch_in_time);

    const updateTimer = () => {
      const diffMs = new Date() - punchInDate;
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

  // Centralized, idempotent camera cleanup
  const stopCamera = useCallback(() => {
    // Invalidate active session so any in-flight asynchronous operations are ignored
    activeSessionIdRef.current++;

    stopDetectionLoop();

    const activeStream = streamRef.current || videoRef.current?.srcObject || stream;
    if (activeStream) {
      try {
        activeStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {
            console.warn("Track stop error:", e);
          }
        });
      } catch (e) {
        console.warn("Stream tracks stop error:", e);
      }
    }

    streamRef.current = null;

    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        // Ignore
      }
    }

    setStream(null);
    setCameraState("idle");
    setVideoReady(false);
    setType(null);
    setPunchDetails(null);
    setErrorMessage("");
    setValidation({ isValid: false, message: "Camera off" });
  }, [stopDetectionLoop, stream]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {
            console.warn("Unmount track stop error:", e);
          }
        });
        streamRef.current = null;
      }
    };
  }, []);

  // Open camera with cancellation token & geolocation timeout protection
  const openCamera = async (punchType) => {
    if (cameraState === "requesting" || cameraState === "starting" || cameraState === "capturing") {
      return;
    }

    const sessionId = ++activeSessionIdRef.current;
    setType(punchType);
    setCameraState("requesting");
    setErrorMessage("");
    setVideoReady(false);
    setValidation({
      isValid: false,
      message: modelsLoadedRef.current
        ? "Position your face inside the frame."
        : "Initializing face detector...",
    });

    let mediaStream = null;

    try {
      // 1. Acquire camera stream (prefer front-facing camera on mobile devices)
      const constraints = {
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (camErr) {
        if (camErr.name === "OverconstrainedError") {
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw camErr;
        }
      }

      // Check if session was cancelled during getUserMedia
      if (activeSessionIdRef.current !== sessionId) {
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
        }
        return;
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setCameraState("starting");

      // 2. Acquire Geolocation with timeout protection
      const coords = await getLocation();

      // Check if session was cancelled during getLocation
      if (activeSessionIdRef.current !== sessionId) {
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
        }
        return;
      }

      setPunchDetails({
        latitude: coords.latitude,
        longitude: coords.longitude,
        altitude: coords.altitude,
        accuracy: coords.accuracy,
        timestamp: coords.timestamp,
      });
    } catch (err) {
      if (activeSessionIdRef.current !== sessionId) {
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
        }
        return;
      }

      console.error("Camera or location activation error:", err);

      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
      stopCamera();

      let userMsg = "Failed to initialize camera or location.";
      if (err.name === "NotAllowedError") {
        userMsg = "Camera permission denied. Please allow camera access in your browser settings to punch attendance.";
        showPopup(userMsg, "error");
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        userMsg = "Camera is already in use by another application or tab.";
        showPopup(userMsg, "warning");
      } else if (err.code === 1) {
        userMsg = err.message || "Location permission denied. Please allow location access in your browser settings to punch attendance.";
        showPopup(userMsg, "error");
      } else if (err.code === 2) {
        userMsg = err.message || "Location unavailable. Please ensure GPS / device location is turned on.";
        showPopup(userMsg, "error");
      } else if (err.code === 3) {
        userMsg = err.message || "Location request timed out. Please check your signal and try again.";
        showPopup(userMsg, "error");
      } else {
        userMsg = err.message || "Camera or location error occurred.";
        showPopup(userMsg, "error");
      }

      setCameraState("error");
      setErrorMessage(userMsg);
    }
  };

  // Image capture with typed Error validation
  const captureImage = () => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video) {
        return reject(new Error("Video element is not available."));
      }
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        return reject(new Error("Camera preview is not ready (zero dimensions)."));
      }
      if (video.paused || video.ended) {
        return reject(new Error("Camera video stream is not active."));
      }
      if (!canvas) {
        return reject(new Error("Canvas element is not available for capture."));
      }

      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Unable to obtain canvas 2D rendering context."));
        }

        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to encode image frame into JPEG blob."));
            } else {
              resolve(blob);
            }
          },
          "image/jpeg",
          0.9
        );
      } catch (err) {
        reject(new Error(`Failed to capture camera frame: ${err.message}`));
      }
    });
  };

  // Submission handler reusing validated location with freshness check
  const handleSubmit = async () => {
    if (loading || !validation.isValid) return;

    if (!punchDetails?.latitude || !punchDetails?.longitude) {
      showPopup("Location coordinates are missing. Please retry camera initialization.", "error");
      return;
    }

    const MAX_LOCATION_AGE_MS = 5 * 60 * 1000; // 5 minutes max age
    let coords = {
      latitude: punchDetails.latitude,
      longitude: punchDetails.longitude,
      accuracy: punchDetails.accuracy ?? null,
    };

    setLoading(true);
    setCameraState("capturing");

    try {
      // Re-validate location freshness if session was held open for over 5 minutes
      if (punchDetails.timestamp && Date.now() - punchDetails.timestamp > MAX_LOCATION_AGE_MS) {
        try {
          const freshCoords = await getLocation({ timeout: 5000 });
          coords = {
            latitude: freshCoords.latitude,
            longitude: freshCoords.longitude,
            accuracy: freshCoords.accuracy,
          };
          setPunchDetails((prev) => ({
            ...prev,
            latitude: freshCoords.latitude,
            longitude: freshCoords.longitude,
            accuracy: freshCoords.accuracy,
            timestamp: freshCoords.timestamp,
          }));
        } catch (locErr) {
          console.warn("Unable to refresh stale location, proceeding with validated coordinates:", locErr);
        }
      }

      if (coords.accuracy != null && coords.accuracy > 100) {
        showPopup(
          `GPS accuracy is too weak (±${Math.round(coords.accuracy)}m). Enterprise attendance requires accuracy within 100 meters. Please move to an open area or enable high accuracy.`,
          "warning"
        );
        setCameraState("ready");
        setLoading(false);
        return;
      }

      const image = await captureImage();

      const url =
        type === "in"
          ? "/attendance/punch-in/"
          : "/attendance/punch-out/";

      let directSuccess = false;
      try {
        // Fast-path: Direct client-to-Cloudinary upload bypassing VPS bandwidth
        const signRes = await API.get("/attendance/upload-params/");
        const signData = signRes.data;

        if (signData?.upload_url && signData?.signature) {
          const uploadFormData = new FormData();
          uploadFormData.append("file", image);
          uploadFormData.append("api_key", signData.apiKey);
          uploadFormData.append("timestamp", signData.timestamp);
          uploadFormData.append("signature", signData.signature);
          uploadFormData.append("folder", signData.folder);
          uploadFormData.append("public_id", signData.public_id);

          const cloudRes = await axios.post(signData.upload_url, uploadFormData);
          if (cloudRes.data?.public_id) {
            directSuccess = {
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: coords.accuracy != null ? Number(coords.accuracy) : undefined,
              photo_public_id: cloudRes.data.public_id,
              photo_url: cloudRes.data.secure_url,
            };
          }
        }
      } catch (directErr) {
        console.warn("Direct upload fallback to VPS relay:", directErr);
      }

      if (directSuccess) {
        const res = await API.post(url, directSuccess);
        showPopup(res.data.message || "Success", "success");
      } else {
        // Fallback: Relay multipart through backend
        const formData = new FormData();
        formData.append("photo", image, `attendance_${Date.now()}.jpg`);
        formData.append("latitude", coords.latitude);
        formData.append("longitude", coords.longitude);
        if (coords.accuracy != null) {
          formData.append("accuracy", coords.accuracy);
        }

        const res = await API.post(url, formData);
        showPopup(res.data.message || "Success", "success");
      }

      stopCamera();
      fetchStatus();
    } catch (err) {
      console.error("Attendance submission error:", err.response?.data || err.message);
      setCameraState("ready");
      showPopup(
        err.response?.data?.error ||
        err.message ||
        "Something went wrong while submitting attendance.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_45%,#14532d_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(74,222,128,0.20),_transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-100">
                <ScanFace size={14} />
                Smart Attendance
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Punch attendance with live camera verification
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                Start your punch with camera access, verify your live location,
                and submit attendance in a cleaner workflow designed for daily use.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroMetric
                icon={<Camera size={18} />}
                label="Camera"
                value={
                  cameraState === "ready"
                    ? "Active"
                    : cameraState === "starting" || cameraState === "requesting"
                    ? "Starting"
                    : cameraState === "capturing"
                    ? "Capturing"
                    : "Standby"
                }
              />
              <HeroMetric
                icon={<MapPinned size={18} />}
                label="Location"
                value={punchDetails?.latitude ? "Captured" : cameraState !== "idle" ? "Acquiring" : "Waiting"}
              />
              <HeroMetric
                icon={<Clock3 size={18} />}
                label="Action"
                value={type === "in" ? "Punch In" : type === "out" ? "Punch Out" : "None"}
              />
              <HeroMetric
                icon={<ShieldCheck size={18} />}
                label="Mode"
                value="Secure"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-semibold text-slate-900">
                Live Camera Panel
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Open the camera to start a punch, review the live frame, and submit once ready.
              </p>
            </div>

            <div className="p-6">
              <div className={`relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)] border-4 transition-all duration-300 ${
                cameraState === "idle" || cameraState === "error"
                  ? "border-transparent"
                  : validation.isValid
                  ? "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                  : "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.35)]"
              }`}>
                {cameraState === "requesting" ? (
                  <div className="flex flex-col items-center justify-center text-center p-6 text-slate-300">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                    <p className="mt-4 text-base font-medium text-white">Connecting to camera & GPS...</p>
                    <p className="mt-1 text-xs text-slate-400">Please allow browser permissions if prompted.</p>
                  </div>
                ) : cameraState === "error" ? (
                  <div className="flex max-w-md flex-col items-center p-6 text-center text-rose-300">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
                      <XCircle size={36} />
                    </div>
                    <h3 className="mt-4 text-xl font-semibold text-white">Camera or Location Error</h3>
                    <p className="mt-2 text-xs leading-5 text-rose-200">{errorMessage || "Unable to activate camera or location."}</p>
                    <div className="mt-6 flex gap-3">
                      <button
                        type="button"
                        onClick={() => openCamera(type || "in")}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-600"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : cameraOn ? (
                  <>
                    <video
                      ref={handleVideoRef}
                      autoPlay
                      playsInline
                      muted
                      onLoadedMetadata={handleVideoMetadataLoaded}
                      onCanPlay={handleVideoCanPlay}
                      className="h-full max-h-[480px] w-full rounded-2xl object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="pointer-events-none absolute inset-x-6 top-6 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow">
                        <span className="h-2 w-2 animate-ping rounded-full bg-white" />
                        Live Camera
                      </span>
                      <span className="rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-white shadow backdrop-blur-sm">
                        {type === "in" ? "Punch In Session" : "Punch Out Session"}
                      </span>
                    </div>

                    {/* Live validation message overlay */}
                    <div className="pointer-events-none absolute inset-x-6 bottom-6 flex justify-center">
                      <span className={`rounded-2xl px-4 py-2.5 text-xs font-semibold shadow-lg text-center backdrop-blur-md transition-all duration-300 border ${
                        validation.isValid
                          ? "bg-emerald-500/95 text-white border-emerald-400"
                          : "bg-amber-500/95 text-white border-amber-400"
                      }`}>
                        {validation.message}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex max-w-md flex-col items-center text-center text-slate-300">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-emerald-300">
                      <Camera size={34} />
                    </div>
                    <h3 className="mt-5 text-2xl font-semibold text-white">
                      Camera ready when you are
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      Choose punch in or punch out to activate the camera, capture your
                      current location, and prepare the attendance submission.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Attendance Actions
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Start a punch workflow or complete the current capture.
                  </p>
                </div>

                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                  <TimerReset size={20} />
                </div>
              </div>

              {activeLoading ? (
                <div className="py-8 text-center text-slate-500 text-sm">
                  Loading attendance status...
                </div>
              ) : modelError ? (
                <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700">
                  <XCircle size={32} />
                  <span className="text-sm font-semibold">Face detector model failed to load</span>
                  <p className="text-xs">{modelErrorMessage || "The local verification models could not be loaded."}</p>
                  <p className="text-xs">Punch submission stays unavailable until verification is ready.</p>
                  <button
                    type="button"
                    onClick={retryFaceModels}
                    className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800"
                  >
                    Retry verification setup
                  </button>
                </div>
              ) : cameraState === "idle" || cameraState === "error" ? (
                <div className="mt-6 space-y-4">
                  {activePunch?.on_leave ? (
                    <div className="mb-6 rounded-2xl border border-rose-100 bg-rose-50/50 p-5 text-center shadow-inner">
                      <span className="text-xs font-semibold uppercase tracking-wider text-rose-800">
                        Leave Status
                      </span>
                      <h3 className="mt-2 text-xl font-bold tracking-wide text-rose-700">
                        Currently on Approved Leave
                      </h3>
                      <p className="mt-2 text-xs text-rose-600">
                        You can punch in after {formatDate(activePunch.leave_last_date)}
                      </p>
                    </div>
                  ) : activePunch?.is_punch_out_pending ? (
                    <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50/50 p-5 text-center shadow-inner animate-pulse">
                      <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                        Shift Status
                      </span>
                      <h3 className="mt-2 text-xl font-bold tracking-wide text-amber-700">
                        Punch Out Pending Approval
                      </h3>
                      <p className="mt-2 text-xs text-amber-600">
                        Workday will close once your punch out is approved.
                      </p>
                    </div>
                  ) : (activePunch?.is_punched_in && activePunch?.punch_in_status !== "leave" && Boolean(activePunch?.punch_in_time)) && (
                    activePunch.punch_in_status === "approved" ? (
                      elapsedTime && (
                        <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 text-center shadow-inner">
                          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                            Active Shift Duration
                          </span>
                          <h3 className="mt-2 text-4xl font-black tabular-nums tracking-wider text-emerald-700 font-mono">
                            {elapsedTime}
                          </h3>
                          <p className="mt-2 text-xs text-emerald-600">
                            Punched in at {new Date(activePunch.punch_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50/50 p-5 text-center shadow-inner animate-pulse">
                        <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                          Shift Status
                        </span>
                        <h3 className="mt-2 text-xl font-bold tracking-wide text-amber-700">
                          Punch In Pending Approval
                        </h3>
                        <p className="mt-2 text-xs text-amber-600">
                          Timer will start once your punch in is approved.
                        </p>
                      </div>
                    )
                  )}

                  {activePunch?.on_leave ? (
                    <button
                      disabled
                      className="flex w-full items-center justify-between rounded-2xl bg-slate-100 px-5 py-4 text-left text-slate-400 cursor-not-allowed border border-slate-200"
                    >
                      <span>
                        <span className="block text-base font-semibold">Punch In Disabled</span>
                        <span className="mt-1 block text-sm text-slate-400">
                          You can punch in after {formatDate(activePunch.leave_last_date)}
                        </span>
                      </span>
                      <XCircle size={20} className="text-slate-400" />
                    </button>
                  ) : activePunch?.is_punch_out_pending ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm font-medium text-slate-500">
                      Awaiting approval for punch out exception.
                    </div>
                  ) : (activePunch?.is_punched_in && activePunch?.punch_in_status !== "leave" && Boolean(activePunch?.punch_in_time)) ? (
                    <button
                      onClick={() => openCamera("out")}
                      className="flex w-full items-center justify-between rounded-2xl bg-rose-600 px-5 py-4 text-left text-white transition hover:bg-rose-700"
                    >
                      <span>
                        <span className="block text-base font-semibold">Punch Out</span>
                        <span className="mt-1 block text-sm text-rose-50">
                          Open camera and close your workday attendance
                        </span>
                      </span>
                      <XCircle size={20} />
                    </button>
                  ) : (
                    <button
                      onClick={() => openCamera("in")}
                      className="flex w-full items-center justify-between rounded-2xl bg-emerald-600 px-5 py-4 text-left text-white transition hover:bg-emerald-700"
                    >
                      <span>
                        <span className="block text-base font-semibold">Punch In</span>
                        <span className="mt-1 block text-sm text-emerald-50">
                          Open camera and start your workday attendance
                        </span>
                      </span>
                      <CheckCircle2 size={20} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {!modelsLoaded && (
                    <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
                      <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                      Face verification is starting. Keep your face in view; submission will be ready as soon as checks pass.
                    </div>
                  )}
                  {!punchDetails?.latitude ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800" role="status">
                      <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                      Acquiring high-accuracy GPS coordinates...
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      Camera and location are ready. Review the details below and submit the current {type === "in" ? "punch in" : "punch out"}.
                    </div>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={loading || !validation.isValid || !punchDetails?.latitude || !videoReady}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Camera size={18} />
                    {loading ? "Processing..." : "Capture & Submit"}
                  </button>

                  <button
                    onClick={stopCamera}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <XCircle size={18} />
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">
                Current Punch Details
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Live metadata appears here after you start a punch action.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <InfoCard
                  label="Punch In Time"
                  value={
                    activePunch?.is_punched_in || activePunch?.is_punch_out_pending
                      ? (activePunch.punch_in_status === "approved"
                          ? new Date(activePunch.punch_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
                          : "Pending Approval")
                      : (cameraState !== "idle" && type === "in"
                          ? "Recorded on submission"
                          : "--")
                  }
                />
                <InfoCard
                  label="Current Action"
                  value={
                    type === "in"
                      ? "Punch In"
                      : type === "out"
                      ? "Punch Out"
                      : activePunch?.is_punched_in
                      ? "Active Shift"
                      : "Standby"
                  }
                />
                <InfoCard
                  label="Latitude"
                  value={formatCoordinate(punchDetails?.latitude)}
                />
                <InfoCard
                  label="Longitude"
                  value={formatCoordinate(punchDetails?.longitude)}
                />
                <InfoCard
                  label="Altitude"
                  value={
                    punchDetails?.altitude === null || punchDetails?.altitude === undefined
                      ? "--"
                      : `${Number(punchDetails.altitude).toFixed(2)} m`
                  }
                />
                <InfoCard
                  label="Camera Status"
                  value={
                    cameraState === "ready"
                      ? "Live & Active"
                      : cameraState === "starting"
                      ? "Starting Preview..."
                      : cameraState === "requesting"
                      ? "Connecting..."
                      : cameraState === "capturing"
                      ? "Capturing Frame..."
                      : cameraState === "error"
                      ? "Error"
                      : "Closed"
                  }
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}

function HeroMetric({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-emerald-100">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
