/**
 * Notification Service
 * Saves a notification to MongoDB and emits a real-time socket event
 * if the recipient is currently connected.
 */

import { deliverNotification } from "./notificationDelivery.js";

/**
 * Create and deliver a notification.
 *
 * @param {object} opts
 * @param {string}  opts.recipientPhone  - Phone number of the user to notify
 * @param {string}  opts.type            - Notification type ("comment" | "like" | "mention")
 * @param {string}  opts.message         - Human-readable message shown in the bell dropdown
 * @param {string}  opts.url             - Frontend route to navigate to on click
 * @param {object}  opts.io              - Socket.io server instance (req.app.get("io"))
 * @param {Map}     opts.onlineUsers     - Map<phone, socketId> of currently connected users
 */
export async function createNotification({ recipientPhone, type, message, url, io, onlineUsers, reportId = null }) {
  try {
    return await deliverNotification({
      recipientPhone,
      type,
      message,
      url,
      reportId,
      io,
      onlineUsers,
    });
  } catch (err) {
    console.error("[Notification] Failed to create notification:", err.message);
    return null;
  }
}
