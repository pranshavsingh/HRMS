import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import * as c from "../controllers/notification.controller.js";

const r = Router();

r.use(authenticate);

r.get("/", c.listNotifications);
r.get("/unread-count", c.getUnreadCount);
r.get("/vapid-public-key", c.getVapidPublicKey);
r.get("/preferences", c.getPreferences);
r.put("/preferences", c.updatePreferences);
r.get("/devices", c.listDevices);
r.delete("/devices/:deviceId", c.removeDevice);
r.patch("/read-all", c.markAllAsRead);
r.delete("/clear-all", c.clearAllNotifications);
r.post("/push-token", c.registerPushToken);
r.delete("/push-token", c.unregisterPushToken);
r.get("/:id", c.getNotificationById);
r.patch("/:id/read", c.markAsRead);
r.post("/:id/click", c.trackNotificationClick);
r.delete("/:id", c.deleteNotification);

export default r;
