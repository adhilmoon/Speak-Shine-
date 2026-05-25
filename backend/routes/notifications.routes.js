import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import Notification from "../../models/notificationSchema.js";
import {
  fetchNotificationsForUser,
  serializeNotification,
} from "../services/notification/notificationDelivery.js";
import { phoneInQuery } from "../utils/phoneVariants.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/notifications
router.get("/", async (req, res) => {
  try {
    const data = await fetchNotificationsForUser(req.user.phone);
    res.json(data);
  } catch (err) {
    console.error("[Notifications] GET error:", err.message);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// PATCH /api/notifications/read
router.patch("/read", async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientPhone: phoneInQuery(req.user.phone), read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("[Notifications] mark all read error:", err.message);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", async (req, res) => {
  try {
    const updated = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientPhone: phoneInQuery(req.user.phone) },
      { $set: { read: true } },
      { new: true }
    ).lean();
    if (!updated) {
      return res.status(404).json({ error: "Notification not found" });
    }
    res.json({ success: true, notification: serializeNotification(updated) });
  } catch (err) {
    console.error("[Notifications] mark one read error:", err.message);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

export default router;
