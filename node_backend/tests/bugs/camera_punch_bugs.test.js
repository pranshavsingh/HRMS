import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

describe("HRMS Camera Attendance Punch-In Hardening & Bug Fixes (BUG-01 to BUG-08)", () => {
  const attendancePath = path.resolve("hrms_saas/src/pages/Attendance.jsx");
  const attendanceSource = fs.readFileSync(attendancePath, "utf8");

  // =========================================================================
  // BUG-01: Camera Stream and Video Element Race Condition (Critical)
  // =========================================================================
  describe("BUG-01: Camera Stream & Video Element Binding Lifecycle", () => {
    it("Attendance.jsx must implement callback ref to bind stream immediately when video mounts", () => {
      assert.ok(
        attendanceSource.includes("handleVideoRef") || attendanceSource.includes("attachVideoRef"),
        "Must implement a callback ref (e.g. handleVideoRef) for immediate stream binding on mount"
      );
      assert.ok(
        attendanceSource.includes("node.srcObject = currentStream") ||
        attendanceSource.includes("node.srcObject = streamRef.current"),
        "Callback ref must assign srcObject directly to the mounted video node"
      );
    });

    it("Attendance.jsx must safely handle video.play() Promise to prevent unhandled autoplay rejections", () => {
      assert.ok(
        attendanceSource.includes(".play()") && attendanceSource.includes(".catch("),
        "Must catch and handle video.play() Promise errors"
      );
    });

    it("Attendance.jsx video element must include playsInline, autoPlay, and muted for mobile/cross-browser support", () => {
      assert.ok(attendanceSource.includes("autoPlay"), "Video element must have autoPlay attribute");
      assert.ok(attendanceSource.includes("playsInline"), "Video element must have playsInline attribute");
      assert.ok(attendanceSource.includes("muted"), "Video element must have muted attribute for unrestricted autoplay");
    });

    it("Attendance.jsx must listen for metadata/canplay and verify non-zero frame dimensions", () => {
      assert.ok(
        attendanceSource.includes("onLoadedMetadata") || attendanceSource.includes("onCanPlay"),
        "Must listen for onLoadedMetadata or onCanPlay to verify stream readiness"
      );
      assert.ok(
        attendanceSource.includes("video.videoWidth > 0") && attendanceSource.includes("video.videoHeight > 0"),
        "Must verify videoWidth and videoHeight > 0 before marking video as ready"
      );
    });
  });

  // =========================================================================
  // BUG-02: Incorrect Geolocation Error Handling
  // =========================================================================
  describe("BUG-02: Geolocation Error Normalization and Code Preservation", () => {
    it("getLocation must reject with a typed Error object, not a plain string", () => {
      assert.ok(
        attendanceSource.includes("const err = new Error("),
        "getLocation must instantiate and reject with an Error object"
      );
      assert.ok(
        !attendanceSource.includes('() => reject("Location denied")'),
        "getLocation must NOT reject with the plain string 'Location denied'"
      );
    });

    it("getLocation must preserve error.code and provide distinct messages for PERMISSION_DENIED, POSITION_UNAVAILABLE, and TIMEOUT", () => {
      assert.ok(attendanceSource.includes("geoError.code === 1") || attendanceSource.includes("error.code === 1"), "Must handle code 1: PERMISSION_DENIED");
      assert.ok(attendanceSource.includes("geoError.code === 2") || attendanceSource.includes("error.code === 2"), "Must handle code 2: POSITION_UNAVAILABLE");
      assert.ok(attendanceSource.includes("geoError.code === 3") || attendanceSource.includes("error.code === 3"), "Must handle code 3: TIMEOUT");
      assert.ok(attendanceSource.includes("err.code ="), "Must preserve error code on the rejected Error instance");
    });
  });

  // =========================================================================
  // BUG-03: Missing Geolocation Timeout
  // =========================================================================
  describe("BUG-03: Explicit Geolocation Timeout Configuration", () => {
    it("getLocation must configure explicit timeout, high accuracy, and maximumAge: 0", () => {
      assert.ok(attendanceSource.includes("timeout: 10000"), "Must set a 10000ms explicit timeout on geolocation");
      assert.ok(attendanceSource.includes("enableHighAccuracy: true"), "Must enable high accuracy");
      assert.ok(attendanceSource.includes("maximumAge: 0"), "Must specify maximumAge: 0 for fresh punch coordinates");
    });

    it("openCamera must stop active media tracks if location acquisition fails or times out", () => {
      assert.ok(
        attendanceSource.includes("mediaStream.getTracks().forEach((track) => track.stop())"),
        "Must stop camera tracks if location acquisition fails"
      );
      assert.ok(
        attendanceSource.includes("stopCamera()"),
        "Must invoke stopCamera() cleanup on location failure"
      );
    });
  });

  // =========================================================================
  // BUG-04: Camera Stream Cleanup and Resource Leak
  // =========================================================================
  describe("BUG-04: Centralized and Idempotent Camera Cleanup", () => {
    it("stopCamera must stop every track, clear streamRef, and reset state", () => {
      assert.ok(attendanceSource.includes("track.stop()"), "Must stop all media tracks");
      assert.ok(attendanceSource.includes("streamRef.current = null"), "Must set streamRef.current = null");
      assert.ok(attendanceSource.includes("setStream(null)"), "Must set stream state to null");
      assert.ok(attendanceSource.includes("videoRef.current.srcObject = null"), "Must clear video srcObject");
    });

    it("openCamera must use session token/cancellation mechanism to prevent stale async stream attachment", () => {
      assert.ok(
        attendanceSource.includes("activeSessionIdRef.current") || attendanceSource.includes("sessionId"),
        "Must use session ID / cancellation token to discard stale async camera operations"
      );
    });

    it("Attendance.jsx must stop tracks and clear intervals on component unmount", () => {
      assert.ok(
        attendanceSource.includes("clearInterval(loopRef.current)"),
        "Must clear detection interval on unmount"
      );
    });
  });

  // =========================================================================
  // BUG-05: Incorrect Error Objects in captureImage()
  // =========================================================================
  describe("BUG-05: captureImage Error Validation", () => {
    it("captureImage must reject with Error instances instead of plain strings", () => {
      assert.ok(
        !attendanceSource.includes('reject("Camera not ready")'),
        "Must not reject with plain string 'Camera not ready'"
      );
      assert.ok(
        !attendanceSource.includes('reject("Image capture failed")'),
        "Must not reject with plain string 'Image capture failed'"
      );
      assert.ok(
        attendanceSource.includes("reject(new Error("),
        "captureImage must reject with new Error(...) instances"
      );
    });

    it("captureImage must validate video element existence, dimensions, and playback status", () => {
      assert.ok(attendanceSource.includes("video.videoWidth === 0"), "Must validate non-zero video width");
      assert.ok(attendanceSource.includes("video.videoHeight === 0"), "Must validate non-zero video height");
      assert.ok(attendanceSource.includes("video.paused || video.ended"), "Must validate that video stream is actively playing");
    });
  });

  // =========================================================================
  // BUG-06: Stale modelsLoaded Value in Face Detection Loop
  // =========================================================================
  describe("BUG-06: Dynamic Face Detection Lifecycle & Concurrency Protection", () => {
    it("Detection loop must use dynamic ref or state to access current modelsLoaded status", () => {
      assert.ok(
        attendanceSource.includes("modelsLoadedRef.current"),
        "Must access latest modelsLoaded status via mutable ref (modelsLoadedRef.current) to avoid closure staleness"
      );
    });

    it("Detection loop must guard against overlapping interval executions", () => {
      assert.ok(
        attendanceSource.includes("isDetectingRef.current"),
        "Must use concurrency flag (e.g. isDetectingRef.current) to prevent overlapping face detection runs"
      );
    });

    it("Face detection loop must not set validation message to 'Camera off' while camera is active", () => {
      // In old code, stopDetectionLoop was called during intermediate renders setting validation message to "Camera off"
      assert.ok(
        !attendanceSource.includes('else {\n      stopDetectionLoop();\n      setValidation({ isValid: false, message: "Camera off" });'),
        "Must not prematurely set message to 'Camera off' during live video renders"
      );
    });
  });

  // =========================================================================
  // BUG-07: Duplicate Geolocation Request During Submission
  // =========================================================================
  describe("BUG-07: Location Reuse & Freshness Validation", () => {
    it("handleSubmit must reuse validated coordinates from camera workflow instead of unconditionally calling getLocation()", () => {
      // Find handleSubmit implementation
      const submitMatch = attendanceSource.match(/const handleSubmit = async \(\) => \{([\s\S]*?)stopCamera\(\);/);
      assert.ok(submitMatch, "Must find handleSubmit definition");
      const submitBody = submitMatch[1];
      assert.ok(
        !submitBody.includes("const coords = await getLocation();"),
        "handleSubmit must NOT blindly request location again"
      );
      assert.ok(
        submitBody.includes("punchDetails.latitude") && submitBody.includes("punchDetails.longitude"),
        "handleSubmit must reuse validated punchDetails coordinates"
      );
    });

    it("handleSubmit must implement location freshness check", () => {
      assert.ok(
        attendanceSource.includes("MAX_LOCATION_AGE_MS") || attendanceSource.includes("timestamp"),
        "Must validate location age / freshness before submitting punch"
      );
    });
  });

  // =========================================================================
  // BUG-08: Authoritative Punch Timestamp
  // =========================================================================
  describe("BUG-08: Authoritative Punch Timestamp & UI Separation", () => {
    it("openCamera must not freeze a client timestamp as the punch time", () => {
      assert.ok(
        !attendanceSource.includes("time: formatPunchTime(new Date())"),
        "openCamera must NOT store a frozen client time as the punch time"
      );
    });

    it("UI must indicate that punch time is recorded on submission and rely on backend server timestamp", () => {
      assert.ok(
        attendanceSource.includes("Recorded on submission"),
        "UI must display 'Recorded on submission' while camera session is active"
      );
      assert.ok(
        attendanceSource.includes("activePunch.punch_in_time"),
        "UI must display server's activePunch.punch_in_time for approved punch"
      );
    });
  });

  // =========================================================================
  // Camera State Machine
  // =========================================================================
  describe("Camera State Machine Management", () => {
    it("Attendance.jsx must implement formal lifecycle states: idle, requesting, starting, ready, capturing, error", () => {
      assert.ok(attendanceSource.includes('"idle"'), "Must support 'idle' state");
      assert.ok(attendanceSource.includes('"requesting"'), "Must support 'requesting' state");
      assert.ok(attendanceSource.includes('"starting"'), "Must support 'starting' state");
      assert.ok(attendanceSource.includes('"ready"'), "Must support 'ready' state");
      assert.ok(attendanceSource.includes('"capturing"'), "Must support 'capturing' state");
      assert.ok(attendanceSource.includes('"error"'), "Must support 'error' state");
    });

    it("openCamera must prevent duplicate activations while connecting or starting", () => {
      assert.ok(
        attendanceSource.includes('cameraState === "requesting"') ||
        attendanceSource.includes('cameraState === "starting"'),
        "Must guard against concurrent openCamera calls"
      );
    });

    it("Live Camera Panel must render loading, error, live video, and standby views based on cameraState", () => {
      assert.ok(attendanceSource.includes('cameraState === "requesting"'), "Must render connecting indicator");
      assert.ok(attendanceSource.includes('cameraState === "error"'), "Must render error retry view");
      assert.ok(attendanceSource.includes('Camera ready when you are'), "Must render standby view");
    });
  });
});
