export default function StatCard({ icon, label, value, color = "#8b5cf6" }) {
  return (
    <div className="stat-card" style={{ "--stat-color": color }}>
      <div className="stat-icon">{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
      {/* Subtle glow orb */}
      <div style={{
        position: "absolute", bottom: -16, right: -16,
        width: 64, height: 64, borderRadius: "50%",
        background: color, opacity: 0.07, pointerEvents: "none",
        filter: "blur(12px)",
      }} />
    </div>
  );
}
