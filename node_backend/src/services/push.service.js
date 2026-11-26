import logger from "../utils/logger.js";
import notificationRepository from "../repositories/notification.repository.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function isExpoPushToken(token) {
  return typeof token === "string" && (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
}

/**
 * Build a lock-screen-safe push payload (no sensitive PII or confidential HRMS metrics).
 */
function buildSafePushBody(notification) {
  switch (notification.category) {
    case "LEAVE":
      return "You have a new leave management update. Open the app to view details.";
    case "ATTENDANCE":
      return "You have a new attendance update. Open the app to view details.";
    case "ROSTER":
      return "Your shift or roster schedule has been updated. Open the app to view details.";
    case "DOCUMENT":
      return "You have a document status update. Open the app to view details.";
    case "HOLIDAY":
      return notification.title || "Company holiday calendar has been updated.";
    default:
      return "You have a new notification in HRMS.";
  }
}

export const pushService = {
  /**
   * Dispatch push notifications for one or more persisted notifications.
   * Never throws to callers; failures are logged to notification_deliveries.
   * @param {Array<object>} notifications
   */
  async sendForNotifications(notifications) {
    if (!Array.isArray(notifications) || notifications.length === 0) return;

    try {
      const tenantId = notifications[0].tenantId || 1;
      const recipientIds = [...new Set(notifications.map((n) => Number(n.recipientId)).filter(Boolean))];
      if (recipientIds.length === 0) return;

      const tokens = await notificationRepository.findActivePushTokensForUsers(tenantId, recipientIds);
      if (!tokens || tokens.length === 0) {
        return;
      }

      const tokensByUser = new Map();
      for (const t of tokens) {
        const uid = Number(t.user_id);
        if (!tokensByUser.has(uid)) tokensByUser.set(uid, []);
        tokensByUser.get(uid).push(t);
      }

      const expoMessages = [];
      const expoMessageNotifIds = [];

      for (const notif of notifications) {
        const userTokens = tokensByUser.get(Number(notif.recipientId)) || [];
        if (userTokens.length === 0) continue;

        for (const tokenRow of userTokens) {
          if (isExpoPushToken(tokenRow.token)) {
            expoMessages.push({
              to: tokenRow.token,
              sound: "default",
              title: String(notif.title || "HRMS Notification").slice(0, 100),
              body: buildSafePushBody(notif),
              data: {
                notificationId: notif.id,
                category: notif.category,
                actionUrl: notif.actionUrl || "/notifications",
              },
              priority: notif.priority === "URGENT" || notif.priority === "HIGH" ? "high" : "default",
            });
            expoMessageNotifIds.push({ notificationId: notif.id, token: tokenRow.token });
          } else {
            // Native FCM token without Firebase Admin credentials configured
            await notificationRepository.logDelivery({
              notificationId: notif.id,
              channel: "push",
              status: "SKIPPED",
              attempts: 0,
              errorMessage: "Direct FCM credentials not configured; use Expo push token or configure FCM_SERVICE_ACCOUNT_JSON.",
            }).catch(() => {});
          }
        }
      }

      if (expoMessages.length === 0) return;

      // Batch send via Expo Push API in chunks of 100
      const invalidTokens = [];
      for (let i = 0; i < expoMessages.length; i += 100) {
        const batch = expoMessages.slice(i, i + 100);
        const batchMeta = expoMessageNotifIds.slice(i, i + 100);
        try {
          const response = await fetch(EXPO_PUSH_URL, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Accept-Encoding": "gzip, deflate",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(batch),
          });
          const result = await response.json().catch(() => ({}));
          const tickets = Array.isArray(result?.data) ? result.data : [];

          for (let j = 0; j < batchMeta.length; j++) {
            const ticket = tickets[j];
            const meta = batchMeta[j];
            if (ticket?.status === "ok") {
              await notificationRepository.logDelivery({
                notificationId: meta.notificationId,
                channel: "push",
                status: "SENT",
                providerMessageId: ticket.id || null,
                attempts: 1,
              }).catch(() => {});
            } else {
              const errCode = ticket?.details?.error || ticket?.message || "Expo push error";
              if (errCode === "DeviceNotRegistered") {
                invalidTokens.push(meta.token);
              }
              await notificationRepository.logDelivery({
                notificationId: meta.notificationId,
                channel: "push",
                status: "FAILED",
                attempts: 1,
                errorMessage: errCode,
              }).catch(() => {});
            }
          }
        } catch (fetchErr) {
          logger.warn("[PushService] Expo push batch send failed: %s", fetchErr.message);
          for (const meta of batchMeta) {
            await notificationRepository.logDelivery({
              notificationId: meta.notificationId,
              channel: "push",
              status: "FAILED",
              attempts: 1,
              errorMessage: fetchErr.message,
            }).catch(() => {});
          }
        }
      }

      if (invalidTokens.length > 0) {
        await notificationRepository.deactivatePushTokensByTokenList([...new Set(invalidTokens)]).catch(() => {});
      }
    } catch (err) {
      logger.warn("[PushService] Unexpected error during push dispatch: %s", err.message);
    }
  },
};

export default pushService;
