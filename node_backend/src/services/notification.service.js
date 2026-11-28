import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  parsePagination,
  formatPaginationResponse,
  parseCursorPagination,
  buildKeysetClause,
  formatCursorResponse,
} from "../utils/pagination/index.js";
import notificationRepository from "../repositories/notification.repository.js";
import realtimeService from "./realtime.service.js";
import pushService from "./push.service.js";
import { REALTIME_EVENTS } from "../constants/realtime-events.js";
import {
  normalizeCategory,
  normalizePriority,
  sanitizeActionUrl,
} from "../constants/notification-types.js";
import logger from "../utils/logger.js";

function validateNotificationInput(input) {
  const recipientId = Number(input?.recipientId);
  if (!Number.isInteger(recipientId) || recipientId <= 0) {
    throw new AppError("Valid recipientId is required", 400);
  }
  const title = String(input?.title || "").trim().slice(0, 255);
  const message = String(input?.message || "").trim();
  const type = String(input?.type || "general").trim().slice(0, 100);
  if (!title || !message) {
    throw new AppError("Notification title and message are required", 400);
  }

  return {
    tenantId: Number(input?.tenantId || 1),
    recipientId,
    actorId: input?.actorId ? Number(input.actorId) : null,
    type,
    category: normalizeCategory(input?.category),
    title,
    message,
    data: input?.data && typeof input.data === "object" ? input.data : null,
    actionUrl: sanitizeActionUrl(input?.actionUrl),
    priority: normalizePriority(input?.priority),
    dedupeKey: input?.dedupeKey ? String(input.dedupeKey).trim().slice(0, 191) : null,
    expiresAt: input?.expiresAt || null,
  };
}

export const notificationService = {
  /**
   * Dispatch real-time Socket.IO + async push notifications AFTER database commit.
   */
  async dispatchAfterCommit(notifications) {
    const list = Array.isArray(notifications) ? notifications.filter(Boolean) : [notifications].filter(Boolean);
    if (list.length === 0) return;

    try {
      const unreadByUser = new Map();
      for (const notif of list) {
        const key = `${notif.tenantId}:${notif.recipientId}`;
        if (!unreadByUser.has(key)) {
          const unreadCount = await notificationRepository.countUnread(notif.tenantId, notif.recipientId);
          unreadByUser.set(key, unreadCount);
        }
        const unreadCount = unreadByUser.get(key);

        realtimeService.emitToUser(
          notif.recipientId,
          REALTIME_EVENTS.NOTIFICATION_NEW,
          { notification: notif, unreadCount },
          notif.id,
          notif.tenantId
        );
        realtimeService.emitToUser(
          notif.recipientId,
          REALTIME_EVENTS.NOTIFICATION_UNREAD_COUNT,
          { unreadCount },
          notif.recipientId,
          notif.tenantId
        );
      }
    } catch (err) {
      logger.warn("[NotificationService] Socket.IO dispatch error: %s", err.message);
    }

    // Non-blocking push delivery
    void pushService.sendForNotifications(list);
  },

  /**
   * Persist a single notification and optionally dispatch immediately (when not inside an external tx).
   */
  async createNotification(input, tx = null) {
    const record = validateNotificationInput(input);
    const created = await notificationRepository.insertOne(record, tx);
    if (!created) return null; // Deduplicated

    if (!tx) {
      await this.dispatchAfterCommit([created]);
    }
    return created;
  },

  /**
   * Persist bulk notifications safely in batched SQL inserts, with deduplication.
   */
  async createBulkNotifications(inputs, tx = null) {
    if (!Array.isArray(inputs) || inputs.length === 0) return [];

    // Deduplicate by tenantId + recipientId in memory as well
    const seen = new Set();
    const records = [];
    for (const item of inputs) {
      const valid = validateNotificationInput(item);
      const memKey = `${valid.tenantId}:${valid.recipientId}:${valid.dedupeKey || valid.type + ":" + valid.title}`;
      if (seen.has(memKey)) continue;
      seen.add(memKey);
      records.push(valid);
    }

    const created = await notificationRepository.insertBulk(records, tx);
    if (created.length > 0 && !tx) {
      await this.dispatchAfterCommit(created);
    }
    return created;
  },

  async getNotifications({ tenantId = 1, recipientId, query = {} }) {
    const cursorPag = parseCursorPagination(query, {
      defaultLimit: 20,
      maxLimit: 100,
      scope: `notif:${recipientId}`,
    });
    const category = query.category ? String(query.category).trim().toUpperCase() : null;
    const unreadOnly = query.unreadOnly === true || query.unreadOnly === "true" || query.unreadOnly === "1";

    if (cursorPag.useCursor) {
      const whereParts = ["tenant_id = ?", "recipient_id = ?"];
      const sqlParams = [tenantId, recipientId];
      if (category) {
        whereParts.push("category = ?");
        sqlParams.push(category);
      }
      if (unreadOnly) {
        whereParts.push("read_at IS NULL");
      }
      const keyset = buildKeysetClause({
        primaryCol: "created_at",
        idCol: "id",
        cursorValues: cursorPag.cursorValues,
        direction: "DESC",
      });
      if (keyset.sql) {
        whereParts.push(keyset.sql);
        sqlParams.push(...keyset.params);
      }

      const [rows, unreadCount] = await Promise.all([
        db.all(
          `SELECT id, tenant_id, recipient_id, actor_id, type, category, title, message,
                  data, action_url, priority, dedupe_key, read_at, expires_at, created_at, updated_at
           FROM notifications
           WHERE ${whereParts.join(" AND ")}
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
          [...sqlParams, cursorPag.fetchLimit]
        ),
        query.cursor ? Promise.resolve(undefined) : notificationRepository.countUnread(tenantId, recipientId),
      ]);

      const mapNotif = (r) => {
        let parsedData = null;
        if (r.data != null) {
          if (typeof r.data === "object") parsedData = r.data;
          else {
            try {
              parsedData = JSON.parse(r.data);
            } catch {
              parsedData = null;
            }
          }
        }
        return {
          id: Number(r.id),
          tenantId: Number(r.tenant_id),
          recipientId: Number(r.recipient_id),
          actorId: r.actor_id != null ? Number(r.actor_id) : null,
          type: r.type,
          category: r.category,
          title: r.title,
          message: r.message,
          data: parsedData,
          actionUrl: r.action_url || null,
          priority: r.priority,
          dedupeKey: r.dedupe_key || null,
          readAt: r.read_at || null,
          expiresAt: r.expires_at || null,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          is_read: Boolean(r.read_at),
        };
      };

      const resp = formatCursorResponse(rows, {
        limit: cursorPag.limit,
        scope: `notif:${recipientId}`,
        extractCursorValues: (r) => [r.created_at instanceof Date ? r.created_at.toISOString().slice(0, 19).replace("T", " ") : String(r.created_at), Number(r.id)],
        mapItem: mapNotif,
        extra: unreadCount !== undefined ? { unreadCount } : {},
      });
      return { ...resp, records: resp.data };
    }

    const { page, limit, offset } = parsePagination(query, 20, 100);

    const [{ records, total }, unreadCount] = await Promise.all([
      notificationRepository.findPaged({
        tenantId,
        recipientId,
        category,
        unreadOnly,
        limit,
        offset,
      }),
      notificationRepository.countUnread(tenantId, recipientId),
    ]);

    return formatPaginationResponse(records, total, page, limit, {
      records,
      unreadCount,
    });
  },

  async getUnreadCount(tenantId = 1, recipientId) {
    const unreadCount = await notificationRepository.countUnread(tenantId, recipientId);
    return { unreadCount };
  },

  async getNotificationById(id, recipientId, tenantId = 1) {
    const notifId = Number(id);
    if (!Number.isInteger(notifId) || notifId <= 0) {
      throw new AppError("Invalid notification id", 400);
    }
    const notif = await notificationRepository.findById(notifId, recipientId, tenantId);
    if (!notif) {
      throw new AppError("Notification not found", 404);
    }
    return notif;
  },

  async markAsRead(id, recipientId, tenantId = 1) {
    const notifId = Number(id);
    if (!Number.isInteger(notifId) || notifId <= 0) {
      throw new AppError("Invalid notification id", 400);
    }
    const res = await notificationRepository.markAsRead(notifId, recipientId, tenantId);
    if (!res) {
      throw new AppError("Notification not found", 404);
    }

    const unreadCount = await notificationRepository.countUnread(tenantId, recipientId);
    if (res.changed) {
      realtimeService.emitToUser(
        recipientId,
        REALTIME_EVENTS.NOTIFICATION_READ,
        { id: notifId, readAt: res.notification.readAt, unreadCount },
        notifId,
        tenantId
      );
      realtimeService.emitToUser(
        recipientId,
        REALTIME_EVENTS.NOTIFICATION_UNREAD_COUNT,
        { unreadCount },
        recipientId,
        tenantId
      );
    }

    return { notification: res.notification, unreadCount };
  },

  async markAllAsRead(recipientId, tenantId = 1, category = null) {
    const normalizedCat = category ? normalizeCategory(category) : null;
    const updatedCount = await notificationRepository.markAllAsRead(recipientId, tenantId, normalizedCat);
    const unreadCount = await notificationRepository.countUnread(tenantId, recipientId);

    realtimeService.emitToUser(
      recipientId,
      REALTIME_EVENTS.NOTIFICATION_READ_ALL,
      { category: normalizedCat, updatedCount, unreadCount },
      recipientId,
      tenantId
    );
    realtimeService.emitToUser(
      recipientId,
      REALTIME_EVENTS.NOTIFICATION_UNREAD_COUNT,
      { unreadCount },
      recipientId,
      tenantId
    );

    return { updatedCount, unreadCount };
  },

  async deleteNotification(id, recipientId, tenantId = 1) {
    const notifId = Number(id);
    if (!Number.isInteger(notifId) || notifId <= 0) {
      throw new AppError("Invalid notification id", 400);
    }
    const deleted = await notificationRepository.deleteById(notifId, recipientId, tenantId);
    if (!deleted) {
      throw new AppError("Notification not found", 404);
    }
    const unreadCount = await notificationRepository.countUnread(tenantId, recipientId);
    realtimeService.emitToUser(
      recipientId,
      REALTIME_EVENTS.NOTIFICATION_UNREAD_COUNT,
      { unreadCount },
      recipientId,
      tenantId
    );
    return { deleted: true, unreadCount };
  },

  async clearAllNotifications(recipientId, tenantId = 1, category = null) {
    const normalizedCat = category ? normalizeCategory(category) : null;
    const deletedCount = await notificationRepository.deleteAllByRecipient(recipientId, tenantId, normalizedCat);
    const unreadCount = await notificationRepository.countUnread(tenantId, recipientId);

    realtimeService.emitToUser(
      recipientId,
      REALTIME_EVENTS.NOTIFICATION_READ_ALL,
      { category: normalizedCat, cleared: true, unreadCount },
      recipientId,
      tenantId
    );
    realtimeService.emitToUser(
      recipientId,
      REALTIME_EVENTS.NOTIFICATION_UNREAD_COUNT,
      { unreadCount },
      recipientId,
      tenantId
    );

    return { deletedCount, unreadCount };
  },

  async registerPushToken({ tenantId = 1, userId, token, platform = "android", provider = "expo", deviceId = null, subscription = null, deviceName = null }) {
    let cleanToken = String(token || "").trim();
    let subscriptionJson = null;
    const cleanProvider = ["expo", "fcm", "webpush"].includes(String(provider).toLowerCase())
      ? String(provider).toLowerCase()
      : "expo";

    if (cleanProvider === "webpush" || (subscription && typeof subscription === "object")) {
      const endpoint = String(subscription?.endpoint || cleanToken || "").trim();
      const p256dh = String(subscription?.keys?.p256dh || "").trim();
      const auth = String(subscription?.keys?.auth || "").trim();
      if (!endpoint || !p256dh || !auth) {
        throw new AppError("Valid Web Push subscription (endpoint, keys.p256dh, keys.auth) is required", 400);
      }
      cleanToken = endpoint;
      subscriptionJson = JSON.stringify({ endpoint, keys: { p256dh, auth } });
    }

    if (!cleanToken || cleanToken.length > 4096) {
      throw new AppError("Valid push token is required", 400);
    }
    const cleanPlatform = ["android", "ios", "web"].includes(String(platform).toLowerCase())
      ? String(platform).toLowerCase()
      : cleanProvider === "webpush" ? "web" : "android";

    await notificationRepository.upsertPushToken({
      tenantId,
      userId,
      token: cleanToken,
      platform: cleanPlatform,
      provider: cleanProvider,
      deviceId: deviceId ? String(deviceId).slice(0, 128) : null,
      subscriptionJson,
      deviceName: deviceName ? String(deviceName).slice(0, 120) : null,
    });
    return { registered: true };
  },

  async unregisterPushToken({ tenantId = null, userId, token }) {
    const cleanToken = String(token || "").trim();
    if (!cleanToken) return { unregistered: true };
    await notificationRepository.deactivatePushToken(userId, cleanToken, tenantId);
    return { unregistered: true };
  },

  async getPreferences(tenantId, userId) {
    return notificationRepository.getPreferences(tenantId, userId);
  },

  async updatePreferences(tenantId, userId, input = {}) {
    const existing = await notificationRepository.getPreferences(tenantId, userId);

    const hasWeb = input.web_push_enabled !== undefined || input.webPushEnabled !== undefined;
    const rawWeb = input.web_push_enabled !== undefined ? input.web_push_enabled : input.webPushEnabled;
    if (hasWeb && typeof rawWeb !== "boolean") {
      throw new AppError("web_push_enabled must be a boolean", 400);
    }

    const hasMobile = input.mobile_push_enabled !== undefined || input.mobilePushEnabled !== undefined;
    const rawMobile = input.mobile_push_enabled !== undefined ? input.mobile_push_enabled : input.mobilePushEnabled;
    if (hasMobile && typeof rawMobile !== "boolean") {
      throw new AppError("mobile_push_enabled must be a boolean", 400);
    }

    const hasCats = input.disabled_categories !== undefined || input.disabledCategories !== undefined;
    const rawCats = input.disabled_categories !== undefined ? input.disabled_categories : input.disabledCategories;
    if (hasCats && (!Array.isArray(rawCats) || rawCats.some((c) => typeof c !== "string"))) {
      throw new AppError("disabled_categories must be an array of category strings", 400);
    }

    return notificationRepository.upsertPreferences(tenantId, userId, {
      webPushEnabled: hasWeb ? rawWeb : existing.web_push_enabled,
      mobilePushEnabled: hasMobile ? rawMobile : existing.mobile_push_enabled,
      disabledCategories: hasCats ? rawCats : existing.disabled_categories,
    });
  },

  async listDevices(tenantId, userId) {
    return notificationRepository.listUserDevices(tenantId, userId);
  },

  async removeDevice(tenantId, userId, deviceRowId) {
    const id = Number(deviceRowId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new AppError("Invalid device ID", 400);
    }
    const removed = await notificationRepository.deactivateUserDeviceById(tenantId, userId, id);
    if (!removed) {
      throw new AppError("Registered device not found", 404);
    }
    return { removed: true };
  },

  async trackClick(notificationId, userId, tenantId, { channel = null, deviceTokenId = null } = {}) {
    const id = Number(notificationId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new AppError("Invalid notification ID", 400);
    }
    const cleanChannel = channel && ["web_push", "mobile_push", "in_app"].includes(String(channel))
      ? String(channel)
      : null;
    const ok = await notificationRepository.markDeliveryClicked(id, tenantId, userId, {
      channel: cleanChannel,
      deviceTokenId,
    });
    if (!ok) {
      throw new AppError("Notification not found", 404);
    }
    await this.markAsRead(id, userId, tenantId).catch(() => {});
    return { clicked: true };
  },

  /**
   * Notify all active users in a tenant (e.g., holiday calendar updates).
   */
  async notifyTenantUsers({ tenantId = 1, actorId = null, type, category = "HOLIDAY", title, message, actionUrl = "/holidays", priority = "NORMAL", dedupePrefix = null }) {
    const recipients = await db.all(
      `SELECT u.id FROM accounts_user u
       JOIN workforce_user_tenant wut ON wut.user_id = u.id AND wut.tenant_id = ? AND wut.is_active = 1
       WHERE u.is_active = 1 AND u.deleted_at IS NULL`,
      [tenantId]
    );
    if (!recipients || recipients.length === 0) return { sentCount: 0 };

    const inputs = recipients.map((r) => ({
      tenantId,
      recipientId: Number(r.id),
      actorId,
      type,
      category,
      title,
      message,
      actionUrl,
      priority,
      dedupeKey: dedupePrefix ? `${dedupePrefix}:${r.id}` : null,
    }));

    const created = await this.createBulkNotifications(inputs);
    return { sentCount: created.length };
  },

  /**
   * Resolve authorized approvers for an employee/requestor action
   * (direct manager + team manager for employees, plus authorized HR/Admin/Superadmin per RBAC).
   * Zero N+1 queries.
   */
  async resolveApproverIdsForEmployee(tenantId, employeeId) {
    const profile = await db.get(
      `SELECT ep.manager_id, ep.team_name, u.role
       FROM accounts_user u
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [employeeId]
    );
    if (!profile) return [];

    const requestorRole = String(profile.role || "employee").toLowerCase();
    const approverIds = new Set();

    if (requestorRole === "employee") {
      if (profile.manager_id && Number(profile.manager_id) !== Number(employeeId)) {
        approverIds.add(Number(profile.manager_id));
      }

      if (profile.team_name) {
        const teamMgrs = await db.all(
          `SELECT u.id FROM accounts_user u
           JOIN accounts_employeeprofile ep ON ep.user_id = u.id
           JOIN workforce_user_tenant wut ON wut.user_id = u.id AND wut.tenant_id = ? AND wut.is_active = 1
           WHERE u.role = 'manager' AND ep.team_name = ? AND u.is_active = 1 AND u.deleted_at IS NULL AND u.id <> ?`,
          [tenantId, profile.team_name, employeeId]
        );
        teamMgrs.forEach((m) => approverIds.add(Number(m.id)));
      }
    }

    let globalRoles = [];
    if (requestorRole === "employee" || requestorRole === "manager") {
      globalRoles = ["hr", "admin", "superadmin"];
    } else if (requestorRole === "hr") {
      globalRoles = ["admin", "superadmin"];
    } else if (requestorRole === "admin") {
      globalRoles = ["superadmin"];
    }

    if (globalRoles.length > 0) {
      const placeholders = globalRoles.map(() => "?").join(", ");
      const admins = await db.all(
        `SELECT u.id FROM accounts_user u
         JOIN workforce_user_tenant wut ON wut.user_id = u.id AND wut.tenant_id = ? AND wut.is_active = 1
         WHERE u.role IN (${placeholders}) AND u.is_active = 1 AND u.deleted_at IS NULL AND u.id <> ?`,
        [tenantId, ...globalRoles, employeeId]
      );
      admins.forEach((a) => approverIds.add(Number(a.id)));
    }

    return Array.from(approverIds);
  },

  /**
   * Safe fire-and-forget wrapper for domain services so notification issues never break primary business transactions.
   */
  async safeNotify(fn) {
    try {
      await fn();
    } catch (err) {
      logger.warn("[NotificationService] Non-blocking notification error: %s", err.message);
    }
  },
};

export default notificationService;
