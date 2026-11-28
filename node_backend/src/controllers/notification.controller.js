import { asyncHandler } from "../utils/asyncHandler.js";
import { resolveTenantId } from "../utils/tenant.js";
import { config } from "../config/env.js";
import notificationService from "../services/notification.service.js";

export const listNotifications = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const data = await notificationService.getNotifications({
    tenantId,
    recipientId: req.user.id,
    query: req.query,
  });
  res.json(data);
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const data = await notificationService.getUnreadCount(tenantId, req.user.id);
  res.json(data);
});

export const getNotificationById = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const data = await notificationService.getNotificationById(req.params.id, req.user.id, tenantId);
  res.json(data);
});

export const markAsRead = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const data = await notificationService.markAsRead(req.params.id, req.user.id, tenantId);
  res.json(data);
});

export const markAllAsRead = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const category = req.body?.category || req.query?.category || null;
  const data = await notificationService.markAllAsRead(req.user.id, tenantId, category);
  res.json(data);
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const data = await notificationService.deleteNotification(req.params.id, req.user.id, tenantId);
  res.json(data);
});

export const clearAllNotifications = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const category = req.query?.category || req.body?.category || null;
  const data = await notificationService.clearAllNotifications(req.user.id, tenantId, category);
  res.json(data);
});

export const registerPushToken = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const { token, platform, provider, deviceId, subscription, deviceName } = req.body || {};
  const data = await notificationService.registerPushToken({
    tenantId,
    userId: req.user.id,
    token,
    platform,
    provider,
    deviceId,
    subscription,
    deviceName,
  });
  res.status(200).json(data);
});

export const unregisterPushToken = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const { token } = req.body || {};
  const data = await notificationService.unregisterPushToken({
    tenantId,
    userId: req.user.id,
    token,
  });
  res.status(200).json(data);
});

export const getVapidPublicKey = asyncHandler(async (_req, res) => {
  res.json({
    publicKey: config.vapidPublicKey || "",
    configured: Boolean(config.vapidPublicKey && config.vapidPrivateKey),
  });
});

export const getPreferences = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  res.json(await notificationService.getPreferences(tenantId, req.user.id));
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  res.json(await notificationService.updatePreferences(tenantId, req.user.id, req.body || {}));
});

export const listDevices = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  res.json({ devices: await notificationService.listDevices(tenantId, req.user.id) });
});

export const removeDevice = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  res.json(await notificationService.removeDevice(tenantId, req.user.id, req.params.deviceId));
});

export const trackNotificationClick = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const channel = req.body?.channel || req.query?.channel || null;
  const deviceTokenId = req.body?.deviceTokenId || req.query?.deviceTokenId || null;
  res.json(await notificationService.trackClick(req.params.id, req.user.id, tenantId, { channel, deviceTokenId }));
});
