import { createRequire } from "node:module";
import logger from "../utils/logger.js";
import { config } from "../config/env.js";
import notificationRepository from "../repositories/notification.repository.js";

const require = createRequire(import.meta.url);
const webpush = require("web-push");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 10000;
let isPollingExpoReceipts = false;

function computeRetryDelayMs(attempt, retryAfterHeader = null) {
  if (retryAfterHeader != null) {
    const sec = Number(retryAfterHeader);
    if (Number.isFinite(sec) && sec >= 0) {
      return Math.min(Math.max(sec * 1000, BASE_RETRY_DELAY_MS), MAX_RETRY_DELAY_MS);
    }
    const dateMs = Date.parse(String(retryAfterHeader));
    if (!Number.isNaN(dateMs)) {
      const diff = dateMs - Date.now();
      return Math.min(Math.max(diff, BASE_RETRY_DELAY_MS), MAX_RETRY_DELAY_MS);
    }
  }
  const exp = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);
  const jitter = Math.floor(Math.random() * 150);
  return Math.min(exp + jitter, MAX_RETRY_DELAY_MS);
}

function isExpoPushToken(token) {
  return typeof token === "string" && (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
}

function isWebPushDevice(tokenRow) {
  return tokenRow?.provider === "webpush" || (tokenRow?.platform === "web" && Boolean(tokenRow?.subscription_json));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let webPushOverride = null;

export function setWebPushClientForTest(client) {
  webPushOverride = client;
}

function getWebPushClient() {
  if (webPushOverride) return webPushOverride;
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return null;
  const wp = webpush?.default || webpush;
  wp.setVapidDetails(config.vapidSubject || "mailto:admin@hrms.local", config.vapidPublicKey, config.vapidPrivateKey);
  return wp;
}

/**
 * Build a lock-screen-safe push payload (no sensitive PII or confidential HRMS metrics).
 */
export function buildSafePushTitle(notification) {
  switch (String(notification?.category || "").toUpperCase()) {
    case "LEAVE":
      return "Leave Update";
    case "ATTENDANCE":
      return "Attendance Update";
    case "ROSTER":
      return "Roster Update";
    case "DOCUMENT":
      return "Document Update";
    case "HOLIDAY":
      return "Holiday Update";
    case "ANNOUNCEMENT":
      return "Company Announcement";
    case "SYSTEM":
      return "System Alert";
    default:
      return "HRMS Notification";
  }
}

export function buildSafePushBody(notification) {
  switch (String(notification?.category || "").toUpperCase()) {
    case "LEAVE":
      return "You have a new leave management update. Open the app to view details.";
    case "ATTENDANCE":
      return "You have a new attendance update. Open the app to view details.";
    case "ROSTER":
      return "Your shift or roster schedule has been updated. Open the app to view details.";
    case "DOCUMENT":
      return "You have a document status update. Open the app to view details.";
    case "HOLIDAY":
      return "Company holiday calendar has been updated. Open the app to view details.";
    default:
      return "You have a new notification in HRMS.";
  }
}

async function sendWebPushWithRetry(wp, subscription, payloadStr) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await wp.sendNotification(subscription, payloadStr, { TTL: 86400 });
      return { ok: true, attempts: attempt, statusCode: res?.statusCode || 201 };
    } catch (err) {
      lastErr = err;
      const statusCode = Number(err?.statusCode || 0);
      // 400/401/403/404/410 are permanent errors -> do not retry
      if (statusCode === 404 || statusCode === 410 || statusCode === 400 || statusCode === 401 || statusCode === 403) {
        return { ok: false, expired: statusCode === 404 || statusCode === 410, attempts: attempt, error: err.message, statusCode };
      }
      const isRetryable = statusCode === 0 || statusCode === 408 || statusCode === 429 || statusCode >= 500;
      if (!isRetryable || attempt >= MAX_RETRY_ATTEMPTS) {
        return { ok: false, expired: false, attempts: attempt, error: err.message, statusCode };
      }
      const retryAfter = err?.headers?.["retry-after"] ?? err?.headers?.["Retry-After"] ?? null;
      await sleep(computeRetryDelayMs(attempt, retryAfter));
    }
  }
  return { ok: false, expired: false, attempts: MAX_RETRY_ATTEMPTS, error: lastErr?.message || "Web push failed" };
}

async function postExpoJsonWithRetry(url, bodyPayload) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      });
      const isRetryableStatus = response.status === 408 || response.status === 429 || response.status >= 500;
      if (isRetryableStatus && attempt < MAX_RETRY_ATTEMPTS) {
        const retryAfter = response.headers?.get?.("retry-after") ?? null;
        await sleep(computeRetryDelayMs(attempt, retryAfter));
        continue;
      }
      const result = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, result, attempts: attempt };
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await sleep(computeRetryDelayMs(attempt));
      }
    }
  }
  return { ok: false, error: lastErr?.message || "Expo push network error", attempts: MAX_RETRY_ATTEMPTS };
}

export const pushService = {
  /**
   * Dispatch unified Web Push + Mobile Expo Push notifications for persisted notifications.
   * Groups by tenantId, respects user preferences, retries transient failures, and logs per-device deliveries.
   */
  async sendForNotifications(notifications) {
    if (!Array.isArray(notifications) || notifications.length === 0) return;

    const byTenant = new Map();
    for (const n of notifications) {
      const tid = Number(n.tenantId || 0);
      if (!tid || !n.recipientId) continue;
      if (!byTenant.has(tid)) byTenant.set(tid, []);
      byTenant.get(tid).push(n);
    }

    const wp = getWebPushClient();

    for (const [tenantId, tenantNotifs] of byTenant.entries()) {
      try {
        const recipientIds = [...new Set(tenantNotifs.map((n) => Number(n.recipientId)).filter(Boolean))];
        if (recipientIds.length === 0) continue;

        const [tokens, prefMap] = await Promise.all([
          notificationRepository.findActivePushTokensForUsers(tenantId, recipientIds),
          notificationRepository.getPreferencesForUsers(tenantId, recipientIds),
        ]);
        if (!tokens || tokens.length === 0) continue;

        const tokensByUser = new Map();
        for (const t of tokens) {
          const uid = Number(t.user_id);
          if (!tokensByUser.has(uid)) tokensByUser.set(uid, []);
          tokensByUser.get(uid).push(t);
        }

        const expoMessages = [];
        const expoMeta = [];
        const invalidTokens = [];

        for (const notif of tenantNotifs) {
          const uid = Number(notif.recipientId);
          const prefs = prefMap.get(uid) || { web_push_enabled: true, mobile_push_enabled: true, disabled_categories: [] };
          const categoryUpper = String(notif.category || "GENERAL").toUpperCase();
          if (prefs.disabled_categories.includes(categoryUpper)) {
            continue;
          }

          const userTokens = tokensByUser.get(uid) || [];
          if (userTokens.length === 0) continue;

          const safeTitle = buildSafePushTitle(notif);
          const safeBody = buildSafePushBody(notif);
          const baseSafeData = {
            notificationId: notif.id,
            category: notif.category,
            actionUrl: notif.actionUrl || "/notifications",
          };

          for (const tokenRow of userTokens) {
            if (isWebPushDevice(tokenRow)) {
              if (!prefs.web_push_enabled) continue;
              if (!wp) {
                await notificationRepository.logDelivery({
                  notificationId: notif.id,
                  channel: "web_push",
                  deviceTokenId: tokenRow.id,
                  status: "SKIPPED",
                  attempts: 0,
                  errorMessage: "VAPID keys are not configured on server.",
                }).catch(() => {});
                continue;
              }
              let sub = null;
              try {
                sub = typeof tokenRow.subscription_json === "string"
                  ? JSON.parse(tokenRow.subscription_json)
                  : tokenRow.subscription_json;
              } catch {
                sub = null;
              }
              if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
                invalidTokens.push(tokenRow.token);
                continue;
              }
              const webRes = await sendWebPushWithRetry(
                wp,
                sub,
                JSON.stringify({
                  title: safeTitle,
                  body: safeBody,
                  tag: `hrms-notif-${notif.id}`,
                  data: { ...baseSafeData, channel: "web_push", deviceTokenId: tokenRow.id },
                })
              );
              if (webRes.ok) {
                await notificationRepository.logDelivery({
                  notificationId: notif.id,
                  channel: "web_push",
                  deviceTokenId: tokenRow.id,
                  status: "SENT",
                  attempts: webRes.attempts,
                }).catch(() => {});
              } else {
                if (webRes.expired) invalidTokens.push(tokenRow.token);
                await notificationRepository.logDelivery({
                  notificationId: notif.id,
                  channel: "web_push",
                  deviceTokenId: tokenRow.id,
                  status: "FAILED",
                  attempts: webRes.attempts,
                  errorMessage: webRes.error,
                }).catch(() => {});
              }
            } else if (isExpoPushToken(tokenRow.token)) {
              if (!prefs.mobile_push_enabled) continue;
              expoMessages.push({
                to: tokenRow.token,
                sound: "default",
                title: safeTitle,
                body: safeBody,
                data: { ...baseSafeData, channel: "mobile_push", deviceTokenId: tokenRow.id },
                priority: notif.priority === "URGENT" || notif.priority === "HIGH" ? "high" : "default",
              });
              expoMeta.push({ notificationId: notif.id, token: tokenRow.token, deviceTokenId: tokenRow.id });
            } else {
              await notificationRepository.logDelivery({
                notificationId: notif.id,
                channel: "mobile_push",
                deviceTokenId: tokenRow.id,
                status: "SKIPPED",
                attempts: 0,
                errorMessage: "Unsupported push token format.",
              }).catch(() => {});
            }
          }
        }

        for (let i = 0; i < expoMessages.length; i += 100) {
          const batch = expoMessages.slice(i, i + 100);
          const batchMeta = expoMeta.slice(i, i + 100);
          const sendRes = await postExpoJsonWithRetry(EXPO_PUSH_URL, batch);
          if (!sendRes.ok) {
            logger.warn("[PushService] Expo push batch send failed: %s", sendRes.error);
            for (const meta of batchMeta) {
              await notificationRepository.logDelivery({
                notificationId: meta.notificationId,
                channel: "mobile_push",
                deviceTokenId: meta.deviceTokenId,
                status: "FAILED",
                attempts: sendRes.attempts,
                errorMessage: sendRes.error,
              }).catch(() => {});
            }
            continue;
          }

          const tickets = Array.isArray(sendRes.result?.data) ? sendRes.result.data : [];
          for (let j = 0; j < batchMeta.length; j++) {
            const ticket = tickets[j];
            const meta = batchMeta[j];
            if (ticket?.status === "ok") {
              await notificationRepository.logDelivery({
                notificationId: meta.notificationId,
                channel: "mobile_push",
                deviceTokenId: meta.deviceTokenId,
                status: "SENT",
                providerMessageId: ticket.id || null,
                attempts: sendRes.attempts,
              }).catch(() => {});
            } else {
              const errCode = ticket?.details?.error || ticket?.message || "Expo push error";
              if (errCode === "DeviceNotRegistered") {
                invalidTokens.push(meta.token);
              }
              await notificationRepository.logDelivery({
                notificationId: meta.notificationId,
                channel: "mobile_push",
                deviceTokenId: meta.deviceTokenId,
                status: "FAILED",
                attempts: sendRes.attempts,
                errorMessage: errCode,
              }).catch(() => {});
            }
          }
        }

        if (invalidTokens.length > 0) {
          await notificationRepository.deactivatePushTokensByTokenList([...new Set(invalidTokens)]).catch(() => {});
        }
      } catch (err) {
        logger.warn("[PushService] Unhandled push error for tenant %s: %s", tenantId, err.message);
      }
    }
  },

  /**
   * Poll Expo push receipts for SENT mobile_push deliveries, reconcile status,
   * handle InvalidCredentials/MessageTooBig, and deactivate DeviceNotRegistered tokens.
   */
  async pollExpoPushReceipts({ minAgeMinutes = 5, limit = 200 } = {}) {
    if (isPollingExpoReceipts) return { skipped: true, processed: 0 };
    isPollingExpoReceipts = true;
    let processed = 0;
    let failed = 0;
    let deactivated = 0;

    try {
      const pending = await notificationRepository.findPendingExpoReceiptDeliveries(limit, minAgeMinutes);
      if (!pending || pending.length === 0) {
        return { skipped: false, processed: 0, failed: 0, deactivated: 0 };
      }

      const invalidTokens = [];

      for (let i = 0; i < pending.length; i += 100) {
        const chunk = pending.slice(i, i + 100);
        const ids = chunk.map((r) => r.provider_message_id).filter(Boolean);
        if (ids.length === 0) continue;

        const res = await postExpoJsonWithRetry(EXPO_RECEIPTS_URL, { ids });
        if (!res.ok) {
          logger.warn("[PushService] Expo getReceipts failed: %s", res.error || res.status);
          continue;
        }

        const receiptsMap = res.result?.data || {};
        const untouchedIds = [];

        for (const row of chunk) {
          const receipt = receiptsMap[row.provider_message_id];
          if (!receipt) {
            untouchedIds.push(row.id);
            continue;
          }

          if (receipt.status === "ok") {
            const changed = await notificationRepository.updateDeliveryReceiptResult({
              deliveryId: row.id,
              status: "RECEIPT_OK",
            });
            if (changed) processed += 1;
          } else {
            const errCode = receipt?.details?.error || receipt?.message || "Expo receipt error";
            if (errCode === "DeviceNotRegistered" && row.token) {
              invalidTokens.push(row.token);
            } else if (errCode === "InvalidCredentials") {
              logger.error("[PushService] CRITICAL Expo InvalidCredentials for delivery %s: %s", row.id, receipt?.message || errCode);
            } else if (errCode === "MessageTooBig") {
              logger.warn("[PushService] Expo MessageTooBig for delivery %s", row.id);
            }
            const changed = await notificationRepository.updateDeliveryReceiptResult({
              deliveryId: row.id,
              status: "FAILED",
              errorMessage: `${errCode}: ${receipt?.message || ""}`.trim(),
            });
            if (changed) failed += 1;
          }
        }

        if (untouchedIds.length > 0) {
          await notificationRepository.touchDeliveryReceiptChecked(untouchedIds).catch(() => {});
        }
      }

      if (invalidTokens.length > 0) {
        const uniqueInvalid = [...new Set(invalidTokens)];
        deactivated = uniqueInvalid.length;
        await notificationRepository.deactivatePushTokensByTokenList(uniqueInvalid).catch(() => {});
      }

      return { skipped: false, processed, failed, deactivated };
    } finally {
      isPollingExpoReceipts = false;
    }
  },
};

export default pushService;
