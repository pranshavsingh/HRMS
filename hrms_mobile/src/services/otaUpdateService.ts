import * as Updates from "expo-updates";
import Constants from "expo-constants";

export type OtaCheckStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "downloaded"
  | "error"
  | "unsupported";

export interface OtaDiagnostics {
  appVersion: string;
  runtimeVersion: string;
  channel: string;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
  isEnabled: boolean;
  createdAt: string | null;
  isUpdateReady: boolean;
  lastCheckAt: string | null;
  lastCheckStatus: OtaCheckStatus;
  lastError: string | null;
}

const CHECK_COOLDOWN_MS = 5 * 60 * 1000;

let lastCheckTimestamp = 0;
let lastCheckAtIso: string | null = null;
let lastCheckStatus: OtaCheckStatus = "idle";
let lastErrorMsg: string | null = null;
let updateReady = false;
let downloadedUpdateId: string | null = null;
let lastReloadAttemptedId: string | null = null;
let inFlightCheck: Promise<OtaDiagnostics> | null = null;

function buildDiagnostics(): OtaDiagnostics {
  return {
    appVersion: String(Constants.expoConfig?.version || "1.0.0"),
    runtimeVersion: String(Updates.runtimeVersion || "unknown"),
    channel: String(Updates.channel || "embedded"),
    updateId: Updates.updateId || null,
    isEmbeddedLaunch: Boolean(Updates.isEmbeddedLaunch),
    isEnabled: Boolean(Updates.isEnabled),
    createdAt: Updates.createdAt ? Updates.createdAt.toISOString() : null,
    isUpdateReady: updateReady,
    lastCheckAt: lastCheckAtIso,
    lastCheckStatus: !Updates.isEnabled || __DEV__ ? "unsupported" : lastCheckStatus,
    lastError: lastErrorMsg,
  };
}

export function getOtaDiagnostics(): OtaDiagnostics {
  return buildDiagnostics();
}

/**
 * Safely check and download compatible OTA updates in the background.
 * Never forces a mid-session reload so active attendance/leave/approval workflows are never interrupted.
 */
export async function checkAndFetchOtaUpdate({
  force = false,
  reason = "startup",
}: {
  force?: boolean;
  reason?: "startup" | "foreground" | "manual";
} = {}): Promise<OtaDiagnostics> {
  if (__DEV__ || !Updates.isEnabled) {
    lastCheckStatus = "unsupported";
    return buildDiagnostics();
  }

  if (inFlightCheck) {
    return inFlightCheck;
  }

  const now = Date.now();
  if (!force && lastCheckTimestamp > 0 && now - lastCheckTimestamp < CHECK_COOLDOWN_MS) {
    return buildDiagnostics();
  }

  inFlightCheck = (async () => {
    lastCheckTimestamp = Date.now();
    lastCheckAtIso = new Date(lastCheckTimestamp).toISOString();
    lastCheckStatus = "checking";
    lastErrorMsg = null;

    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        lastCheckStatus = updateReady ? "downloaded" : "up-to-date";
        return buildDiagnostics();
      }

      const fetchRes = await Updates.fetchUpdateAsync();
      if (fetchRes.isNew) {
        updateReady = true;
        downloadedUpdateId = fetchRes.manifest?.id || null;
        lastCheckStatus = "downloaded";
        console.log(`[OTA:${reason}] Downloaded update ${downloadedUpdateId || "new"}; will apply on next launch or manual restart.`);
      } else {
        lastCheckStatus = "up-to-date";
      }
      return buildDiagnostics();
    } catch (err: any) {
      lastCheckStatus = "error";
      lastErrorMsg = err?.message ? String(err.message).slice(0, 200) : "Update check failed";
      console.warn(`[OTA:${reason}] Update check failed:`, lastErrorMsg);
      return buildDiagnostics();
    } finally {
      inFlightCheck = null;
    }
  })();

  return inFlightCheck;
}

/**
 * Apply a downloaded update only when explicitly triggered by the user from a safe screen.
 * Guards against repeated reload loops on the same update ID.
 */
export async function applyDownloadedOtaUpdate(): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled || !updateReady) {
    return false;
  }
  if (downloadedUpdateId && lastReloadAttemptedId === downloadedUpdateId) {
    return false;
  }
  try {
    lastReloadAttemptedId = downloadedUpdateId || "pending";
    await Updates.reloadAsync();
    return true;
  } catch (err: any) {
    lastErrorMsg = err?.message ? String(err.message).slice(0, 200) : "Reload failed";
    return false;
  }
}
