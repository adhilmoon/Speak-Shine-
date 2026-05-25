/**
 * Normalize Indian phone numbers for DB lookups and socket routing.
 * Auth JWT, User.phone, and VideoReport.phone may use different formats.
 */

export function phoneVariants(phone) {
  if (!phone) return [];
  const raw = String(phone).trim();
  const stripped = raw.replace(/^(\+91|91)/, "").replace(/\D/g, "");
  const variants = new Set();
  if (raw) variants.add(raw);
  if (stripped) {
    variants.add(stripped);
    variants.add(`91${stripped}`);
    variants.add(`+91${stripped}`);
  }
  return [...variants];
}

/** MongoDB query filter: { recipientPhone: { $in: variants } } */
export function phoneInQuery(phone) {
  const variants = phoneVariants(phone);
  return variants.length ? { $in: variants } : phone;
}

/**
 * Find socket id for a user across phone format variants.
 * @param {Map<string, string>} onlineUsers
 */
export function resolveOnlineSocketId(onlineUsers, phone) {
  if (!onlineUsers || !phone) return null;
  for (const variant of phoneVariants(phone)) {
    const socketId = onlineUsers.get(variant);
    if (socketId) return socketId;
  }
  return null;
}
