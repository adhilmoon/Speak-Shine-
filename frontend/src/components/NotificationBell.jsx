import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";
import { getSharedSocket } from "../hooks/useSocket.js";

function normalizeNotif(raw) {
  if (!raw) return null;
  return {
    _id: String(raw._id || raw.id || ""),
    type: raw.type || "comment",
    message: raw.message || "",
    url: raw.url || null,
    reportId: raw.reportId ? String(raw.reportId) : null,
    read: !!raw.read,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function mergeNotif(prev, incoming) {
  const n = normalizeNotif(incoming);
  if (!n?._id) return prev;
  const without = prev.filter((x) => x._id !== n._id);
  return [n, ...without].slice(0, 50);
}

/**
 * Notification bell — persisted in DB, delivered live via socket.
 */
export default function NotificationBell() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const panelRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data } = await api.get("/notifications");
      const list = (data.notifications || []).map(normalizeNotif).filter(Boolean);
      setNotifications(list);
      setUnreadCount(data.unreadCount ?? list.filter((n) => !n.read).length);
    } catch (err) {
      console.warn("[Notifications] fetch failed:", err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time + refetch when socket connects (fixes missed events before connect)
  useEffect(() => {
    if (!token) return;
    const socket = getSharedSocket(token);

    const onNew = (payload) => {
      const n = normalizeNotif(payload);
      if (!n?._id) return;
      setNotifications((prev) => mergeNotif(prev, n));
      setUnreadCount((c) => c + 1);
    };

    const onConnect = () => {
      fetchNotifications();
    };

    socket.on("notification:new", onNew);
    socket.on("connect", onConnect);
    if (socket.connected) onConnect();

    return () => {
      socket.off("notification:new", onNew);
      socket.off("connect", onConnect);
    };
  }, [token, fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    fetchNotifications();
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open, fetchNotifications]);

  const markAllRead = async () => {
    if (!token || unreadCount === 0) return;
    try {
      await api.patch("/notifications/read");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.warn("[Notifications] mark all read failed:", err.message);
    }
  };

  const handleClick = async (notif) => {
    setOpen(false);

    if (!notif.read) {
      setNotifications((prev) =>
        prev.map((n) => (n._id === notif._id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await api.patch(`/notifications/${notif._id}/read`);
      } catch (err) {
        console.warn("[Notifications] mark read failed:", err.message);
      }
    }

    if (notif.url) {
      navigate(notif.url);
    } else if (notif.reportId) {
      navigate(`/community?highlight=${notif.reportId}`);
    } else {
      navigate("/community");
    }
  };

  const togglePanel = () => setOpen((v) => !v);

  const relativeTime = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const typeIcon = (type) => {
    if (type === "like") return "❤️";
    if (type === "mention") return "📣";
    return "💬";
  };

  const isMobile = typeof window !== "undefined" && window.innerWidth <= 640;

  if (!token) return null;

  return (
    <>
      <style>{`
        @keyframes notif-pop {
          0%   { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes notif-slide-in {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes notif-slide-up {
          0%   { opacity: 0; transform: translateY(100%); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .notif-item:hover { background: rgba(124,111,255,0.08) !important; }
        .notif-item:active { transform: scale(0.98); }
        .notif-mark-all:hover { color: #c4b5fd !important; }
        @media (max-width: 640px) {
          .notif-panel-mobile {
            position: fixed !important;
            top: auto !important; bottom: 0 !important;
            left: 0 !important; right: 0 !important;
            width: 100% !important;
            max-height: 85vh !important;
            border-radius: 24px 24px 0 0 !important;
            animation: notif-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
        }
        .notif-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(124,111,255,0.3) transparent;
        }
      `}</style>

      <div ref={panelRef} style={{ position: "relative" }}>
        <button
          id="notification-bell-btn"
          type="button"
          onClick={togglePanel}
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          style={{
            position: "relative",
            background: open ? "rgba(124,111,255,0.15)" : "rgba(255,255,255,0.06)",
            border: open ? "1px solid rgba(124,111,255,0.4)" : "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={open ? "#a78bfa" : "#aaaacc"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: -2, right: -2,
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              color: "#fff", borderRadius: "50%",
              minWidth: 20, height: 20, fontSize: "0.7rem", fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 4px",
              boxShadow: "0 0 0 2px #0d0d1a, 0 2px 8px rgba(239,68,68,0.4)",
              animation: "notif-pop 0.3s cubic-bezier(.34,1.56,.64,1)",
              pointerEvents: "none",
            }}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {open && isMobile && (
          <div
            role="presentation"
            onClick={() => setOpen(false)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
              zIndex: 9998,
            }}
          />
        )}

        {open && (
          <div
            className="notif-panel-mobile"
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              width: Math.min(380, typeof window !== "undefined" ? window.innerWidth - 32 : 380),
              maxHeight: isMobile ? "85vh" : "520px",
              background: "linear-gradient(145deg, #0f0f23 0%, #161630 100%)",
              border: "1px solid rgba(124,111,255,0.25)",
              borderRadius: 16,
              boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              zIndex: 9999,
              animation: isMobile ? "notif-slide-up 0.3s ease" : "notif-slide-in 0.2s ease",
            }}
          >
            {isMobile && (
              <div style={{ padding: "12px 0 8px", display: "flex", justifyContent: "center" }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)" }} />
              </div>
            )}

            <div style={{
              padding: isMobile ? "1rem 1.25rem 0.85rem" : "0.9rem 1rem 0.75rem",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontWeight: 700, color: "#e8e8ff", fontSize: isMobile ? "1rem" : "0.875rem" }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span style={{
                    background: "rgba(124,111,255,0.2)", color: "#a78bfa",
                    borderRadius: 20, padding: "2px 8px", fontSize: "0.72rem", fontWeight: 700,
                  }}>
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {notifications.some((n) => !n.read) && (
                  <button type="button" className="notif-mark-all" onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                    style={{ background: "none", border: "none", color: "#7777aa", fontSize: "0.75rem", cursor: "pointer" }}>
                    Mark all read
                  </button>
                )}
                {isMobile && (
                  <button type="button" onClick={() => setOpen(false)}
                    style={{ background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 8, width: 32, height: 32, color: "#7777aa", cursor: "pointer" }}>
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="notif-scroll" style={{ overflowY: "auto", flex: 1, WebkitOverflowScrolling: "touch" }}>
              {loading && notifications.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "#555577" }}>Loading…</div>
              ) : notifications.length === 0 ? (
                <div style={{ padding: "2.5rem 1rem", textAlign: "center", color: "#555577" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🔕</div>
                  No notifications yet
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif._id}
                    className="notif-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleClick(notif)}
                    onKeyDown={(e) => e.key === "Enter" && handleClick(notif)}
                    style={{
                      padding: isMobile ? "1rem 1.25rem" : "0.75rem 1rem",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      cursor: "pointer",
                      display: "flex",
                      gap: "0.65rem",
                      alignItems: "flex-start",
                      background: notif.read ? "transparent" : "rgba(124,111,255,0.05)",
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "rgba(124,111,255,0.12)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      {typeIcon(notif.type)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        color: notif.read ? "#9999bb" : "#d4d4f0",
                        fontSize: "0.85rem", lineHeight: 1.5, fontWeight: notif.read ? 400 : 500,
                        wordBreak: "break-word",
                      }}>
                        {notif.message}
                      </div>
                      <div style={{ color: "#555577", fontSize: "0.72rem", marginTop: "0.2rem" }}>
                        {relativeTime(notif.createdAt)}
                        {(notif.reportId || notif.url?.includes("community")) && (
                          <span style={{ color: "#7c6fff", marginLeft: "0.35rem" }}>→ View</span>
                        )}
                      </div>
                    </div>
                    {!notif.read && (
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: "#7c6fff", flexShrink: 0, marginTop: 6,
                      }} />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
