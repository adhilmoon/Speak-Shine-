/**
 * Shared notification persistence + real-time delivery.
 */

import Notification from "../../../models/notificationSchema.js";
import { phoneInQuery, resolveOnlineSocketId } from "../../utils/phoneVariants.js";

export function serializeNotification(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    _id: String(o._id),
    type: o.type || "comment",
    message: o.message,
    url: o.url || null,
    reportId: o.reportId ? String(o.reportId) : null,
    read: !!o.read,
    createdAt: o.createdAt,
  };
}

/**
 * Create notification and emit to owner if online.
 */
export async function deliverNotification({
  recipientPhone,
  type,
  message,
  url = "/community",
  reportId = null,
  io,
  onlineUsers,
}) {
  if (!recipientPhone || !message) return null;

  const notif = await Notification.create({
    recipientPhone,
    type,
    message,
    url: url || (reportId ? `/community?highlight=${reportId}` : "/community"),
    reportId,
    read: false,
  });

  const payload = serializeNotification(notif);

  if (io && onlineUsers) {
    const socketId = resolveOnlineSocketId(onlineUsers, recipientPhone);
    if (socketId) {
      io.to(socketId).emit("notification:new", payload);
    }
  }

  return notif;
}

/**
 * Fetch notifications for a user (all unread + recent read).
 */
export async function fetchNotificationsForUser(phone, { limit = 50 } = {}) {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await Notification.find({
    recipientPhone: phoneInQuery(phone),
    $or: [
      { read: false },
      { read: true, createdAt: { $gte: since7d } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const notifications = rows.map(serializeNotification);
  const unreadCount = notifications.filter((n) => !n.read).length;
  return { notifications, unreadCount };
}
