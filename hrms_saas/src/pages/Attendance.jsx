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

let faceModelsPromise;

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

export default function Attendance() {
  const { showPopup } = usePopup();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState(null);
  const [punchDetails, setPunchDetails] = useState(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [modelErrorMessage, setModelErrorMessage] = useState("");
  const [validation, setValidation] = useState({
    isValid: false,
    message: "Initializing face detector...",
  });

  const [activePunch, setActivePunch] = useState(null);
  const [activeLoading, setActiveLoading] = useState(true);
  const [elapsedTime, setElapsedTime] = useState("");

  const formatPunchTime = (date) =>
    new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);

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

  useEffect(() => {
    const loadModels = async () => {
      try {
        await loadFaceModels();
        setModelsLoaded(true);
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
    } catch (err) {
      console.error("Error retrying face-api models:", err);
      setModelErrorMessage(err?.message || "The local verification models could not be loaded.");
      setModelError(true);
    }
  };

  const startDetectionLoop = useCallback(() => {
    if (loopRef.current) clearInterval(loopRef.current);

    loopRef.current = setInterval(async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || video.paused || video.ended || !modelsLoaded) {
        return;
      }

      try {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
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

        // All checks passed!
        setValidation({
          isValid: true,
          message: "Perfect! Face verified. Ready to capture.",
        });

      } catch (err) {
        console.error("Face detection loop error:", err);
      }
    }, 400);
  }, [modelsLoaded]);

  const stopDetectionLoop = useCallback(() => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
    setValidation({ isValid: false, message: "Camera off" });
  }, []);

  useEffect(() => {
    if (cameraOn && modelsLoaded && videoRef.current) {
      const timer = setTimeout(() => {
        startDetectionLoop();
      }, 500);
      return () => {
        clearTimeout(timer);
        stopDetectionLoop();
      };
    } else {
      stopDetectionLoop();
    }
  }, [cameraOn, modelsLoaded, startDetectionLoop, stopDetectionLoop]);

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

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (loopRef.current) {
        clearInterval(loopRef.current);
      }
    };
  }, []);

  const openCamera = async (punchType) => {
    let mediaStream = null;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);

      const coords = await getLocation();

      setCameraOn(true);
      setType(punchType);
      setPunchDetails({
        latitude: coords.latitude,
        longitude: coords.longitude,
        altitude: coords.altitude,
        time: formatPunchTime(new Date()),
      });
    } catch (err) {
      console.error("Camera error:", err);
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
      stopCamera();

      if (err.name === "NotAllowedError") {
        showPopup("Camera permission denied", "error");
      } else if (err.name === "NotReadableError") {
        showPopup("Camera already in use", "warning");
      } else if (err.code === 1) {
        showPopup("Location permission denied. Please allow location access to punch.", "error");
      } else if (err.code === 3) {
        showPopup("Location request timed out. Please try again.", "error");
      } else {
        showPopup(err.message || "Camera or location error", "error");
      }
    }
  };

  const stopCamera = () => {
    const activeStream = streamRef.current || videoRef.current?.srcObject || stream;

    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
    }

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOn(false);
    setStream(null);
    setType(null);
    setPunchDetails(null);
  };

  const captureImage = () => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || video.videoWidth === 0) {
        reject("Camera not ready");
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) reject("Image capture failed");
          else resolve(blob);
        },
        "image/jpeg",
        0.9
      );
    });
  };

  const getLocation = () => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        () => reject("Location denied")
      );
    });
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      const image = await captureImage();
      const coords = await getLocation();

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

        const res = await API.post(url, formData);
        showPopup(res.data.message || "Success", "success");
      }

      stopCamera();
      fetchStatus();
    } catch (err) {
      console.error(err.response?.data || err.message);

      showPopup(
        err.response?.data?.error ||
        err.message ||
        "Something went wrong",
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
                value={cameraOn ? "Active" : "Standby"}
              />
              <HeroMetric
                icon={<MapPinned size={18} />}
                label="Location"
                value={cameraOn ? "Captured" : "Waiting"}
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
                !cameraOn
                  ? "border-transparent"
                  : validation.isValid
                  ? "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                  : "border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.35)]"
              }`}>
                {cameraOn ? (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="h-full max-h-[480px] w-full rounded-2xl object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="pointer-events-none absolute inset-x-6 top-6 flex items-center justify-between">
                      <span className="rounded-full bg-emerald-500/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                        Live Camera
                      </span>
                      <span className="rounded-full bg-slate-900/70 px-3 py-1 text-xs font-semibold text-white">
                        {type === "in" ? "Punch In Session" : "Punch Out Session"}
                      </span>
                    </div>

                    {/* Live validation message overlay */}
                    <div className="absolute inset-x-6 bottom-6 flex justify-center">
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
              ) : !cameraOn ? (
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
                  ) : activePunch?.is_punched_in && (
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
                  ) : activePunch?.is_punched_in ? (
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
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Camera and location are ready. Review the details below and submit the current {type === "in" ? "punch in" : "punch out"}.
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={loading || !validation.isValid}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Camera size={18} />
                    {loading ? "Processing..." : "Capture & Submit"}
                  </button>

                  <button
                    onClick={stopCamera}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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
                      : (type === "in" ? punchDetails?.time : "--")
                  }
                />
                <InfoCard
                  label="Current Action"
                  value={type === "in" ? "Punch In" : type === "out" ? "Punch Out" : "--"}
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
                  value={cameraOn ? "Open" : "Closed"}
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
