# API Environment Configuration and Client Network Hardening Specification

**Document**: `docs/phase-4/API_ENVIRONMENT_CONFIGURATION.md`  
**Requirement**: R3 (API Configuration and Environment Management) & R7 (Production Release Builds)  
**Target Subsystems**: `hrms_saas/`, `hrms_mobile/`, `node_backend/`  
**Certified Baseline Commit**: `0896d0b`  
**Working Branch**: `feat/phase-4-web-mobile-hardening`  
**Date**: 2026-11-16  
**Status**: APPROVED SPECIFICATION — Environment Architecture & Client Network Guidelines

---

## 1. Architectural Scope and Principles

Modern enterprise applications require strict separation across deployment tiers. The HRMS platform operates across four primary operational tiers:
1. **Development (`development`)**: Local workstation development, hot-reloading, simulated backends, local proxy servers.
2. **Local Testing (`test`)**: Automated unit, integration, and end-to-end (E2E) regression testing environments with deterministic mock backends.
3. **Staging / Preview (`staging` / `preview`)**: Cloud-hosted pre-production replica mirroring production clustering, databases, and SSL, used for client acceptance testing.
4. **Production (`production`)**: Live hardened cloud environment serving real employee attendance, leave, and payroll operations.

### Non-Negotiable Environmental Security Rules
- **Zero Secrets in Client Artifacts**: Web (`hrms_saas`) and mobile (`hrms_mobile`) client bundles run in untrusted user environments. Under no circumstances may backend database credentials, Redis passwords, encryption keys, or JWT secret keys be committed or bundled into frontend code. Only public client configuration keys (prefixed with `VITE_` or `EXPO_PUBLIC_`) may exist in client code.
- **Strict Prohibition of Localhost Fallbacks in Production**: Release builds for web and mobile must never default to `localhost`, `127.0.0.1`, or `10.0.2.2`. Production bundles compiled without explicit environment configurations must fail the build immediately or throw explicit runtime exceptions rather than connecting to developer bridge IPs.
- **Enforced Network Security & Transport Encryption**: Production traffic must use HTTPS/WSS exclusively. Android release builds must disable cleartext HTTP traffic (`usesCleartextTraffic: false`).

---

## 2. Environment Matrix Across Tiers

| Parameter | Development | Local Testing | Staging / Preview | Production |
|---|---|---|---|---|
| **Tier Identifier** | `development` | `test` | `staging` | `production` |
| **Backend API Host** | `http://localhost:8000` | `http://127.0.0.1:8000` | `https://staging-api.hrms.internal` | `https://api.hrms.com` |
| **Backend API Base Path** | `/api/v1` | `/api/v1` | `/api/v1` | `/api/v1` |
| **Web Client URL** | `http://localhost:5173` | `http://localhost:5173` | `https://staging-app.hrms.internal` | `https://app.hrms.com` |
| **Mobile API Host (Android Dev)** | `http://10.0.2.2:8000` or LAN IP | `http://10.0.2.2:8000` | `https://staging-api.hrms.internal` | `https://api.hrms.com` |
| **Mobile API Host (iOS Dev)** | `http://localhost:8000` | `http://localhost:8000` | `https://staging-api.hrms.internal` | `https://api.hrms.com` |
| **Cookie Security** | `Secure: false`, `SameSite: Lax`, `Path: /api` | `Secure: false`, `SameSite: Lax`, `Path: /api` | `Secure: true`, `SameSite: Lax`, `Path: /api` | `Secure: true`, `SameSite: Lax`, `Path: /api` |
| **Cleartext Traffic (Android)** | Allowed (`true`) | Allowed (`true`) | Prohibited (`false`) | Prohibited (`false`) |
| **Client Log Level** | `debug` / `verbose` | `warn` / `error` | `info` / `warn` | `error` only (sanitized) |
| **HTTP Timeout (Default)** | 30,000 ms | 10,000 ms | 15,000 ms | 15,000 ms |

---

## 3. Web Client Configuration (`hrms_saas/`)

Vite statically replaces variables matching `import.meta.env.VITE_*` during client bundling.

### 3.1 Environment File Hierarchy

The web client repository root `hrms_saas/` defines the following environment files:

```
hrms_saas/
├── .env.example            # Documented template showing all allowed variables
├── .env.development        # Active during `npm run dev`
├── .env.test               # Active during automated tests (`vitest`)
├── .env.staging            # Active during staging builds (`npm run build -- --mode staging`)
└── .env.production         # Active during production builds (`npm run build`)
```

#### 3.1.1 `.env.example`
```bash
# HRMS SaaS Client Environment Template
# Note: Variables prefixed with VITE_ are exposed to the client bundle.
# NEVER place backend secrets, passwords, or private API keys here.

# Backend API Root URL (must not include trailing slash)
VITE_API_BASE_URL=https://api.hrms.com/api

# Realtime SSE Streaming URL
VITE_SSE_URL=https://api.hrms.com/api/v1/auth/realtime/

# Application Environment Mode ('development' | 'test' | 'staging' | 'production')
VITE_APP_ENV=production

# Public Integrations (Optional)
VITE_GOOGLE_MAPS_API_KEY=
```

#### 3.1.2 `.env.development`
```bash
VITE_API_BASE_URL=http://localhost:8000/api
VITE_SSE_URL=http://localhost:8000/api/v1/auth/realtime/
VITE_APP_ENV=development
```

#### 3.1.3 `.env.test`
```bash
VITE_API_BASE_URL=http://127.0.0.1:8000/api
VITE_SSE_URL=http://127.0.0.1:8000/api/v1/auth/realtime/
VITE_APP_ENV=test
```

#### 3.1.4 `.env.staging`
```bash
VITE_API_BASE_URL=https://staging-api.hrms.internal/api
VITE_SSE_URL=https://staging-api.hrms.internal/api/v1/auth/realtime/
VITE_APP_ENV=staging
```

#### 3.1.5 `.env.production`
```bash
VITE_API_BASE_URL=https://api.hrms.com/api
VITE_SSE_URL=https://api.hrms.com/api/v1/auth/realtime/
VITE_APP_ENV=production
```

### 3.2 Build-Time Localhost Guard (`hrms_saas/vite.config.js`)

To guarantee Requirement R3 and R7 compliance, `vite.config.js` executes a build-time validation plugin. If `NODE_ENV === "production"` or `mode === "production"` and `VITE_API_BASE_URL` contains `localhost` or `127.0.0.1`, Vite halts the build with an exit error:

```javascript
// vite.config.js
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Guard: Reject localhost in production builds
  if (mode === 'production') {
    const apiUrl = env.VITE_API_BASE_URL || '';
    if (!apiUrl || apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
      throw new Error(
        `[SECURITY ERROR] Production build rejected: VITE_API_BASE_URL is invalid or pointing to localhost ("${apiUrl}"). ` +
        `Configure a valid production API endpoint in .env.production or CI environment variables.`
      );
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});
```

### 3.3 Axios Client Environment Integration (`hrms_saas/src/api/axios.js`)

```javascript
import axios from "axios";

const apiUrl = import.meta.env.VITE_API_BASE_URL;

// Throw immediately in production if environment was not configured
if (import.meta.env.PROD && (!apiUrl || apiUrl.includes("127.0.0.1") || apiUrl.includes("localhost"))) {
  throw new Error("[SECURITY CONFIG ERROR] Invalid production API configuration.");
}

const API = axios.create({
  baseURL: apiUrl || "http://localhost:8000/api",
  timeout: 15000, // 15-second timeout
  withCredentials: true, // Enables HttpOnly cookie transmission
  headers: {
    "Content-Type": "application/json",
    "X-Platform": "web",
  },
});
```

*CORS Preflight & Header Allowance*:
To prevent browser preflight failures on requests carrying the custom `X-Platform` header, the backend Express CORS configuration (`corsOptions.allowedHeaders` in `node_backend/src/app.js`) MUST include `X-Platform` alongside `Content-Type` and `Authorization`.

---

## 4. Mobile Client Configuration (`hrms_mobile/`)

Expo statically inlines environment variables prefixed with `EXPO_PUBLIC_` at bundling time.

### 4.1 Environment Variable Management

In `hrms_mobile/`:
- **Variable**: `EXPO_PUBLIC_API_URL`
- Format: Full base URL without trailing slash (e.g., `https://api.hrms.com/api`).
- Configured via `.env` files locally and EAS secrets/environment variables in cloud builds:
  - `.env.development`: `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api`
  - `.env.staging`: `EXPO_PUBLIC_API_URL=https://staging-api.hrms.internal/api`
  - `.env.production`: `EXPO_PUBLIC_API_URL=https://api.hrms.com/api`

### 4.2 Localhost Fallback Elimination (`hrms_mobile/src/services/api.ts`)

Pre-hardening code fell back silently to `10.0.2.2:8000` or `localhost:8000`. The hardened implementation inspects `__DEV__` and throws an unrecoverable configuration error if missing in release mode:

```typescript
import axios from "axios";
import { Platform } from "react-native";

const envUrl = process.env.EXPO_PUBLIC_API_URL;

// Guard against localhost in release builds
if (!__DEV__ && (!envUrl || envUrl.includes("localhost") || envUrl.includes("10.0.2.2") || envUrl.includes("127.0.0.1"))) {
  throw new Error(
    `[CRITICAL CONFIG ERROR] Release build executed without valid production EXPO_PUBLIC_API_URL ("${envUrl}").`
  );
}

// Development fallback only
const BASE_URL = envUrl || (Platform.OS === "android" ? "http://10.0.2.2:8000/api" : "http://localhost:8000/api");

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    "X-Platform": Platform.OS,
  },
});
```

### 4.3 Android Network Security & Permissions (`app.json`)

`hrms_mobile/app.json` is updated to define the Android package name, permissions, and network security configuration:

```json
{
  "expo": {
    "name": "HRMS Mobile",
    "slug": "hrms-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "hrms",
    "userInterfaceStyle": "automatic",
    "android": {
      "package": "com.pranshavsingh.hrms",
      "versionCode": 1,
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/images/android-icon-foreground.png",
        "backgroundImage": "./assets/images/android-icon-background.png",
        "monochromeImage": "./assets/images/android-icon-monochrome.png"
      },
      "predictiveBackGestureEnabled": false,
      "usesCleartextTraffic": false,
      "permissions": [
        "android.permission.CAMERA",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.INTERNET"
      ]
    },
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "HRMS requires camera access for biometric face attendance verification."
        }
      ],
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "HRMS requires location access to verify authorized office geofence boundaries during punch-in."
        }
      ]
    ]
  }
}
```

### 4.4 EAS Build Profiles (`eas.json`)

`hrms_mobile/eas.json` defines repeatable, secure cloud and local build profiles across development, staging (preview), and production tiers:

```json
{
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "gradleCommand": ":app:assembleDebug"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "http://10.0.2.2:8000/api",
        "EXPO_PUBLIC_APP_ENV": "development"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://staging-api.hrms.internal/api",
        "EXPO_PUBLIC_APP_ENV": "staging"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.hrms.com/api",
        "EXPO_PUBLIC_APP_ENV": "production"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

---

## 5. Network Policies, Timeouts, and Error Classification

To prevent application hangs, resource exhaustion, and poor user experience under unstable mobile or web connections, all HTTP operations must adhere to deterministic timeout and error classification rules.

### 5.1 Timeout Policies

| Request Category | Timeout Window | Client Action on Exceed |
|---|---|---|
| **Standard Data Queries (GET)** | 10,000 ms (10s) | Abort request; display non-blocking retry indicator. |
| **Mutation Requests (POST/PUT/DELETE)** | 15,000 ms (15s) | Abort request; display warning to check network before resubmission. |
| **Biometric / Document Uploads** | 45,000 ms (45s) | Display upload progress; offer resume or retry if aborted. |
| **Token Refresh (`/auth/refresh/`)** | 8,000 ms (8s) | Abort refresh; initiate failover queue rejection and session recovery. |

### 5.2 Network Error Classification Matrix

Client Axios interceptors categorize errors into four deterministic classes to present clear user feedback and prevent uncaught crashes:

```typescript
export enum NetworkErrorKind {
  UNAUTHORIZED = "UNAUTHORIZED",       // 401
  FORBIDDEN = "FORBIDDEN",             // 403
  CLIENT_VALIDATION = "VALIDATION",     // 400, 422
  RATE_LIMITED = "RATE_LIMITED",       // 429
  SERVER_FAULT = "SERVER_FAULT",       // 500, 502, 503, 504
  TIMEOUT = "TIMEOUT",                 // ECONNABORTED
  NETWORK_OFFLINE = "NETWORK_OFFLINE", // No connection, ERR_NETWORK
}

export function classifyNetworkError(error: any): NetworkErrorKind {
  if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
    return NetworkErrorKind.TIMEOUT;
  }
  if (!error.response) {
    return NetworkErrorKind.NETWORK_OFFLINE;
  }
  const status = error.response.status;
  if (status === 401) return NetworkErrorKind.UNAUTHORIZED;
  if (status === 403) return NetworkErrorKind.FORBIDDEN;
  if (status === 429) return NetworkErrorKind.RATE_LIMITED;
  if (status >= 400 && status < 500) return NetworkErrorKind.CLIENT_VALIDATION;
  if (status >= 500) return NetworkErrorKind.SERVER_FAULT;
  return NetworkErrorKind.NETWORK_OFFLINE;
}
```

### 5.3 Retry Policy Guidelines
1. **Idempotent Requests (`GET`, `HEAD`)**: Automatic retry with exponential backoff up to 2 times on `NETWORK_OFFLINE` or `SERVER_FAULT` (502/503/504).
2. **Non-Idempotent Requests (`POST`, `PUT`, `DELETE`)**: Never retry automatically on network timeout, as the server may have processed the operation. Display explicit user prompt.
3. **Authentication Refresh (`POST /auth/refresh/`)**: Handled exclusively through the single-flight mutex queue with `_retry: true` flag. The backend grace window is configured to 30 seconds (`config.refreshGraceWindowSeconds || 30`), comfortably absorbing client refresh timeouts (8s) and mobile network retries without triggering false-positive token replay revocations.

---
*Configuration specification certified for implementation across `hrms_saas/` and `hrms_mobile/`.*