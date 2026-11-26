import React, { useMemo, useState } from 'react';
import { FACE_SHAPE_META } from '../../data/initialData';
import { FaceShape, FrameItem, UsageSessionRecord } from '../../types/framefit';

interface DashboardProps {
  frames: FrameItem[];
  usageSessions: UsageSessionRecord[];
  onInspectLowStockFrame: (frameId: string) => void;
}

export const AdminDashboard: React.FC<DashboardProps> = ({
  frames,
  usageSessions,
  onInspectLowStockFrame,
}) => {
  const [cameraOnline, setCameraOnline] = useState(true);
  const [dbSynced, setDbSynced] = useState(true);
  const [networkStable, setNetworkStable] = useState(true);

  const kioskOnline = cameraOnline && dbSynced && networkStable;

  const todayStr = '2026-11-23';
  const displayDate = '11/23/2026';

  const todaySessions = useMemo(
    () => usageSessions.filter((s) => s.date === todayStr),
    [usageSessions]
  );

  const totalSessionsToday = todaySessions.length;
  const totalFramesTriedToday = todaySessions.reduce((acc, s) => acc + s.framesTriedCount, 0);
  const totalSummariesToday = todaySessions.filter((s) => s.summaryPrintedOrSent).length;

  const faceShapeStats = useMemo(() => {
    const source = todaySessions.length > 0 ? todaySessions : usageSessions;
    const counts: Partial<Record<FaceShape, number>> = {};
    source.forEach((s) => {
      counts[s.detectedFaceShape] = (counts[s.detectedFaceShape] || 0) + 1;
    });
    const total = source.length || 1;
    return (Object.entries(counts) as [FaceShape, number][])
      .map(([shape, count]) => ({
        shape,
        count,
        pct: Math.round((count / total) * 100),
        color: FACE_SHAPE_META[shape].color,
      }))
      .sort((a, b) => b.count - a.count);
  }, [todaySessions, usageSessions]);

  const lowStockFrames = useMemo(
    () => frames.filter((f) => f.stock < 3).sort((a, b) => a.stock - b.stock),
    [frames]
  );

  // Build SVG pie chart slices
  const pieSlices = useMemo(() => {
    let cumulative = 0;
    const total = faceShapeStats.reduce((sum, s) => sum + s.count, 0) || 1;
    return faceShapeStats.map((stat) => {
      const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
      cumulative += stat.count;
      const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
      const r = 80;
      const cx = 90;
      const cy = 90;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const d =
        stat.count === total
          ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
          : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      return { ...stat, d };
    });
  }, [faceShapeStats]);

  return (
    <div className="min-h-full flex flex-col gap-4 pb-2">
      {/* Top Status Strip matching Page 25 */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="font-mono-ui text-[17px] lg:text-[19px] text-black font-medium">
              Kiosk Status:
            </span>
            <span
              className={`px-4 py-0.5 rounded-full font-mono-ui text-[14px] font-bold shadow-xs ${
                kioskOnline ? 'bg-[#8FFF00] text-black' : 'bg-[#CF3434] text-white'
              }`}
            >
              {kioskOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: 'Camera online', ok: cameraOnline, toggle: () => setCameraOnline((v) => !v) },
              { label: 'Local database synced', ok: dbSynced, toggle: () => setDbSynced((v) => !v) },
              { label: 'Network stable', ok: networkStable, toggle: () => setNetworkStable((v) => !v) },
            ].map((ind) => (
              <button
                key={ind.label}
                type="button"
                onClick={ind.toggle}
                title="Click to simulate subsystem health status"
                className="inline-flex items-center gap-1.5 bg-white/90 hover:bg-white px-3 py-1 rounded-full font-mono-ui text-[12px] text-[#1F2937] shadow-xs cursor-pointer"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    ind.ok ? 'bg-[#5AD400]' : 'bg-[#CF3434]'
                  }`}
                />
                <span>{ind.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="font-mono-ui text-[16px] lg:text-[18px] text-black">
          Date: <span className="italic text-[#4B5563]">{displayDate}</span>
        </div>
      </div>

      {/* 3 Dashboard Cards matching Page 25 (compact zoomed-out proportions) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* 1. Today's Traffic Card */}
        <div className="bg-white rounded-[22px] p-4 shadow-sm flex flex-col justify-between">
          <h3 className="font-mono-ui text-[17px] text-black text-center font-medium">
            Today&apos;s Traffic Card
          </h3>

          <div className="space-y-3 my-3">
            <div className="bg-[#F2F8FD] rounded-xl p-3 text-center">
              <div className="font-mono-ui text-[12px] text-[#5B6570]">
                Total Sessions Completed Today
              </div>
              <div className="font-mono-ui text-[30px] font-bold text-[#176BA8] tabular-nums leading-tight mt-0.5">
                {totalSessionsToday}
              </div>
            </div>

            <div className="bg-[#F2F8FD] rounded-xl p-3 text-center">
              <div className="font-mono-ui text-[12px] text-[#5B6570]">
                Total Frames Tried On via AR
              </div>
              <div className="font-mono-ui text-[30px] font-bold text-[#3BBEFF] tabular-nums leading-tight mt-0.5">
                {totalFramesTriedToday}
              </div>
            </div>

            <div className="bg-[#F2F8FD] rounded-xl p-3 text-center">
              <div className="font-mono-ui text-[12px] text-[#5B6570]">
                Summaries Printed / Sent Today
              </div>
              <div className="font-mono-ui text-[24px] font-bold text-[#1A5878] tabular-nums leading-tight mt-0.5">
                {totalSummariesToday}
              </div>
            </div>
          </div>

          <div className="font-mono-ui text-[11px] text-[#6B747E] text-center">
            Live sync from D4 Usage Store
          </div>
        </div>

        {/* 2. Top Face Shapes Pie Chart */}
        <div className="bg-white rounded-[22px] p-4 shadow-sm flex flex-col justify-between">
          <h3 className="font-mono-ui text-[17px] text-black text-center font-medium">
            Top Face Shapes
          </h3>

          <div className="flex flex-col items-center justify-center my-2">
            <svg viewBox="0 0 180 180" className="w-[146px] h-[146px]" aria-label="Top Face Shapes Pie Chart">
              {pieSlices.map((s) => (
                <path key={s.shape} d={s.d} fill={s.color} stroke="#FFFFFF" strokeWidth="1.5" />
              ))}
            </svg>
          </div>

          <div className="space-y-1.5 pt-1">
            {faceShapeStats.map((stat) => (
              <div
                key={stat.shape}
                className="flex items-center justify-between font-mono-ui text-[13px] px-1.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3.5 h-3.5 rounded-sm shrink-0"
                    style={{ backgroundColor: stat.color }}
                  />
                  <span className="text-black">{stat.shape}</span>
                </div>
                <span className="font-semibold text-[#1F2937] tabular-nums">{stat.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Low Stock Alerts */}
        <div className="bg-white rounded-[22px] p-4 shadow-sm flex flex-col min-h-[320px]">
          <h3 className="font-mono-ui text-[17px] text-black text-center font-medium mb-3 shrink-0">
            Low Stock Alerts
          </h3>

          <div className="flex-1 max-h-[340px] bg-[#F4F5FA] rounded-xl p-2.5 overflow-y-auto admin-scroll space-y-2.5">
            {lowStockFrames.length === 0 ? (
              <div className="h-full flex items-center justify-center font-mono-ui text-[13px] text-[#5B6570] text-center p-4">
                All frames have 3 or more units in stock.
              </div>
            ) : (
              lowStockFrames.map((frame) => (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => onInspectLowStockFrame(frame.id)}
                  className="w-full low-stock-gradient hover:brightness-95 rounded-[14px] p-3 text-left shadow-sm cursor-pointer transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono-ui text-[13px] font-bold text-[#5A0E0E] leading-snug">
                      {frame.name}
                    </div>
                    <span className="bg-[#CF3434] text-white px-2 py-0.5 rounded-full font-mono-ui text-[11px] font-bold shrink-0 tabular-nums">
                      {frame.stock} left
                    </span>
                  </div>
                  <div className="font-mono-ui text-[12px] text-[#6E1B1B] mt-1 flex justify-between">
                    <span>SKU: {frame.sku}</span>
                    <span>{frame.shelfLocation}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
