import { db } from "../db/index.js";

function parseJsonSafe(val) {
  if (val == null) return null;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function formatNotificationRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    tenantId: Number(row.tenant_id),
    recipientId: Number(row.recipient_id),
    actorId: row.actor_id != null ? Number(row.actor_id) : null,
    type: row.type,
    category: row.category,
    title: row.title,
    message: row.message,
    data: parseJsonSafe(row.data),
    actionUrl: row.action_url || null,
    priority: row.priority,
    dedupeKey: row.dedupe_key || null,
    readAt: row.read_at || null,
    expiresAt: row.expires_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const notificationRepository = {
  async insertOne(record, tx = null) {
    const sql = `
      INSERT IGNORE INTO notifications
        (tenant_id, recipient_id, actor_id, type, category, title, message, data, action_url, priority, dedupe_key, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      record.tenantId,
      record.recipientId,
      record.actorId ?? null,
      record.type,
      record.category,
      record.title,
      record.message,
      record.data != null ? JSON.stringify(record.data) : null,
      record.actionUrl ?? null,
      record.priority,
      record.dedupeKey ?? null,
      record.expiresAt ?? null,
    ];
    const result = await db.run(sql, params, tx);
    if (!result.lastID || result.changes === 0) {
      return null; // Deduplicated (INSERT IGNORE skipped)
    }
    return this.findById(result.lastID, record.recipientId, record.tenantId, tx);
  },

  async insertBulk(records, tx = null) {
    if (!records || records.length === 0) return [];
    const chunkSize = 200;
    const inserted = [];

    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const params = [];
      for (const r of chunk) {
        params.push(
          r.tenantId,
          r.recipientId,
          r.actorId ?? null,
          r.type,
          r.category,
          r.title,
          r.message,
          r.data != null ? JSON.stringify(r.data) : null,
          r.actionUrl ?? null,
          r.priority,
          r.dedupeKey ?? null,
          r.expiresAt ?? null
        );
      }

      const sql = `
        INSERT IGNORE INTO notifications
          (tenant_id, recipient_id, actor_id, type, category, title, message, data, action_url, priority, dedupe_key, expires_at)
        VALUES ${placeholders}
      `;
      const result = await db.run(sql, params, tx);
      if (result.lastID && result.changes > 0) {
        const rows = await db.all(
          `SELECT * FROM notifications
           WHERE id >= ? AND tenant_id = ?
           ORDER BY id ASC
           LIMIT ?`,
          [result.lastID, chunk[0].tenantId, chunk.length],
          tx
        );
        rows.forEach((row) => inserted.push(formatNotificationRow(row)));
      }
    }
    return inserted;
  },

  async findById(id, recipientId, tenantId, tx = null) {
    const row = await db.get(
      `SELECT * FROM notifications
       WHERE id = ? AND recipient_id = ? AND tenant_id = ?
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [id, recipientId, tenantId],
      tx
    );
    return formatNotificationRow(row);
  },

  async findPaged({ tenantId, recipientId, category = null, unreadOnly = false, limit = 20, offset = 0 }, tx = null) {
    const where = [
      "tenant_id = ?",
      "recipient_id = ?",
      "(expires_at IS NULL OR expires_at > NOW())",
    ];
    const params = [tenantId, recipientId];

    if (category && category !== "ALL") {
      where.push("category = ?");
      params.push(category);
    }
    if (unreadOnly) {
      where.push("read_at IS NULL");
    }

    const whereSql = where.join(" AND ");
    const [rows, countRow] = await Promise.all([
      db.all(
        `SELECT * FROM notifications
         WHERE ${whereSql}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset],
        tx
      ),
      db.get(
        `SELECT COUNT(*) AS total FROM notifications WHERE ${whereSql}`,
        params,
        tx
      ),
    ]);

    return {
      records: rows.map(formatNotificationRow),
      total: Number(countRow?.total || 0),
    };
  },

  async countUnread(tenantId, recipientId, tx = null) {
    const row = await db.get(
      `SELECT COUNT(*) AS cnt FROM notifications
       WHERE tenant_id = ? AND recipient_id = ? AND read_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [tenantId, recipientId],
      tx
    );
    return Number(row?.cnt || 0);
  },

  async markAsRead(id, recipientId, tenantId, tx = null) {
    const existing = await this.findById(id, recipientId, tenantId, tx);
    if (!existing) return null;
    if (existing.readAt) return { notification: existing, changed: false };

    await db.run(
      `UPDATE notifications
       SET read_at = NOW(), updated_at = NOW()
       WHERE id = ? AND recipient_id = ? AND tenant_id = ? AND read_at IS NULL`,
      [id, recipientId, tenantId],
      tx
    );
    const updated = await this.findById(id, recipientId, tenantId, tx);
    return { notification: updated, changed: true };
  },

  async markAllAsRead(recipientId, tenantId, category = null, tx = null) {
    const where = ["tenant_id = ?", "recipient_id = ?", "read_at IS NULL"];
    const params = [tenantId, recipientId];
    if (category && category !== "ALL") {
      where.push("category = ?");
      params.push(category);
    }
    const res = await db.run(
      `UPDATE notifications
       SET read_at = NOW(), updated_at = NOW()
       WHERE ${where.join(" AND ")}`,
      params,
      tx
    );
    return Number(res.changes || 0);
  },

  async deleteById(id, recipientId, tenantId, tx = null) {
    const res = await db.run(
      `DELETE FROM notifications WHERE id = ? AND recipient_id = ? AND tenant_id = ?`,
      [id, recipientId, tenantId],
      tx
    );
    return Number(res.changes || 0) > 0;
  },

  async deleteAllByRecipient(recipientId, tenantId, category = null, tx = null) {
    const where = ["tenant_id = ?", "recipient_id = ?"];
    const params = [tenantId, recipientId];
    if (category && category !== "ALL") {
      where.push("category = ?");
      params.push(category);
    }
    const res = await db.run(
      `DELETE FROM notifications WHERE ${where.join(" AND ")}`,
      params,
      tx
    );
    return Number(res.changes || 0);
  },

  // --- Push Token Management ---

  async upsertPushToken({ tenantId, userId, token, platform = "android", provider = "expo", deviceId = null }, tx = null) {
    await db.run(
      `INSERT INTO notification_push_tokens
         (tenant_id, user_id, token, platform, provider, device_id, is_active, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE
         tenant_id = VALUES(tenant_id),
         user_id = VALUES(user_id),
         platform = VALUES(platform),
         provider = VALUES(provider),
         device_id = VALUES(device_id),
         is_active = 1,
         last_used_at = NOW(),
         updated_at = NOW()`,
      [tenantId, userId, token, platform, provider, deviceId],
      tx
    );
  },

  async deactivatePushToken(userId, token, tx = null) {
    await db.run(
      `UPDATE notification_push_tokens
       SET is_active = 0, updated_at = NOW()
       WHERE user_id = ? AND token = ?`,
      [userId, token],
      tx
    );
  },

  async deactivatePushTokensByTokenList(tokens, tx = null) {
    if (!tokens || tokens.length === 0) return;
    const placeholders = tokens.map(() => "?").join(", ");
    await db.run(
      `UPDATE notification_push_tokens
       SET is_active = 0, updated_at = NOW()
       WHERE token IN (${placeholders})`,
      tokens,
      tx
    );
  },

  async findActivePushTokensForUsers(tenantId, userIds, tx = null) {
    if (!userIds || userIds.length === 0) return [];
    const placeholders = userIds.map(() => "?").join(", ");
    return db.all(
      `SELECT id, user_id, token, platform, provider
       FROM notification_push_tokens
       WHERE tenant_id = ? AND user_id IN (${placeholders}) AND is_active = 1`,
      [tenantId, ...userIds],
      tx
    );
  },

  // --- Delivery Tracking ---

  async logDelivery({ notificationId, channel, status, providerMessageId = null, attempts = 1, errorMessage = null }, tx = null) {
    await db.run(
      `INSERT INTO notification_deliveries
         (notification_id, channel, status, provider_message_id, attempts, error_message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [notificationId, channel, status, providerMessageId, attempts, errorMessage ? String(errorMessage).slice(0, 1000) : null],
      tx
    );
  },
};

export default notificationRepository;
