export default function StatCard({ icon, label, value, color = "#7c6fff" }) {
  return (
    <div
      className="bg-[#16162a] border border-[#252545] rounded-2xl p-5 flex items-center gap-4 hover:border-[#353560] transition-all duration-200 min-w-0"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="text-3xl shrink-0 leading-none">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-[#8888aa] font-medium mb-1 truncate">{label}</p>
        <p className="text-xl font-bold text-[#e8e8f4] truncate">{value}</p>
      </div>
    </div>
  );
}
