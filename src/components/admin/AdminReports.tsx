import React, { useMemo, useState } from 'react';
import { FrameItem, UsageSessionRecord } from '../../types/framefit';

interface ReportsProps {
  frames: FrameItem[];
  usageSessions: UsageSessionRecord[];
}

export const AdminReports: React.FC<ReportsProps> = ({ frames, usageSessions }) => {
  const [startDate, setStartDate] = useState('2026-11-20');
  const [endDate, setEndDate] = useState('2026-11-23');
  const [appliedRange, setAppliedRange] = useState({ start: '2026-11-20', end: '2026-11-23' });
  const [exportNotice, setExportNotice] = useState('');

  const filteredSessions = useMemo(() => {
    return usageSessions.filter(
      (s) => s.date >= appliedRange.start && s.date <= appliedRange.end
    );
  }, [usageSessions, appliedRange]);

  const totalSessions = filteredSessions.length;
  const convertedCount = filteredSessions.filter((s) => s.summaryPrintedOrSent).length;
  const conversionRate =
    totalSessions > 0 ? Math.round((convertedCount / totalSessions) * 100) : 0;
  const totalTryOns = filteredSessions.reduce((sum, s) => sum + s.framesTriedCount, 0);

  const top10Frames = useMemo(() => {
    const counts: Record<string, number> = {};
    frames.forEach((f) => {
      counts[f.id] = f.favoriteCount;
    });
    filteredSessions.forEach((s) => {
      s.favoritedFrameIds.forEach((fid) => {
        counts[fid] = (counts[fid] || 0) + 1;
      });
    });

    const list = frames
      .map((f) => ({
        id: f.id,
        name: f.name,
        sku: f.sku,
        count: counts[f.id] || 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const maxCount = Math.max(...list.map((i) => i.count), 1);
    return list.map((item) => ({
      ...item,
      widthPct: Math.round((item.count / maxCount) * 100),
    }));
  }, [frames, filteredSessions]);

  const handleGenerate = () => {
    setAppliedRange({ start: startDate, end: endDate });
  };

  const handleExportCsv = () => {
    const headers = ['Session ID', 'Date', 'Face Shape', 'Frames Tried', 'Summary Printed/Sent'];
    const rows = filteredSessions.map((s) => [
      s.id,
      s.date,
      s.detectedFaceShape,
      String(s.framesTriedCount),
      s.summaryPrintedOrSent ? 'Yes' : 'No',
    ]);
    const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `framefit_usage_report_${appliedRange.start}_to_${appliedRange.end}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportNotice('CSV report downloaded.');
    window.setTimeout(() => setExportNotice(''), 2500);
  };

  const handleExportPdf = () => {
    window.print();
    setExportNotice('Print / Save as PDF dialog opened.');
    window.setTimeout(() => setExportNotice(''), 2500);
  };

  return (
    <div className="flex flex-col gap-6 font-mono-ui">
      {/* Usage Report Generator */}
      <div className="bg-white rounded-[26px] p-6 shadow-xs flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#1A5878] mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 bg-[#F2F6FA] border border-[#CBD5E1] rounded-full px-5 text-[15px]"
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#1A5878] mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-11 bg-[#F2F6FA] border border-[#CBD5E1] rounded-full px-5 text-[15px]"
            />
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            className="h-11 bg-[#176BA8] hover:bg-[#135A8E] text-white px-8 rounded-full text-[16px] font-medium shadow cursor-pointer"
          >
            Generate
          </button>
        </div>

        <div className="flex items-center gap-3">
          {exportNotice && (
            <span className="text-[13px] font-semibold text-[#1D6B12]">{exportNotice}</span>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-11 bg-[#3BBEFF] hover:bg-[#2AAEEB] text-white px-6 rounded-full text-[15px] font-semibold cursor-pointer"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="h-11 bg-[#1A5878] hover:bg-[#13425B] text-white px-6 rounded-full text-[15px] font-semibold cursor-pointer"
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* Conversion Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-[24px] p-5 shadow-xs">
          <div className="text-[14px] text-[#5B6570]">Sessions in Period</div>
          <div className="text-[36px] font-bold text-[#176BA8] tabular-nums mt-1">
            {totalSessions}
          </div>
          <div className="text-[12px] text-[#6B747E] mt-1">
            {appliedRange.start} to {appliedRange.end}
          </div>
        </div>

        <div className="bg-white rounded-[24px] p-5 shadow-xs">
          <div className="text-[14px] text-[#5B6570]">Selection Summaries Printed / Sent</div>
          <div className="text-[36px] font-bold text-[#229900] tabular-nums mt-1">
            {convertedCount}{' '}
            <span className="text-[22px] font-semibold text-[#1F2937]">
              ({conversionRate}%)
            </span>
          </div>
          <div className="text-[12px] text-[#6B747E] mt-1">
            Sessions {totalSessions} → Summaries {convertedCount} = {conversionRate}%
          </div>
        </div>

        <div className="bg-white rounded-[24px] p-5 shadow-xs">
          <div className="text-[14px] text-[#5B6570]">Total AR Frame Try-Ons</div>
          <div className="text-[36px] font-bold text-[#3BBEFF] tabular-nums mt-1">
            {totalTryOns}
          </div>
          <div className="text-[12px] text-[#6B747E] mt-1">Anonymous usage data (D4)</div>
        </div>
      </div>

      {/* Popular Selections Top 10 Bar Chart */}
      <div className="bg-white rounded-[26px] p-6 shadow-xs space-y-4">
        <h3 className="text-[21px] font-semibold text-[#176BA8]">
          Popular Selections — Top 10 Most Favorited Frames
        </h3>

        <div className="space-y-3">
          {top10Frames.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-4">
              <div className="w-[34px] text-[14px] font-bold text-[#1A5878] tabular-nums">
                #{idx + 1}
              </div>
              <div className="w-[290px] truncate text-[14px] font-medium text-black">
                {item.name}
              </div>
              <div className="flex-1 h-7 bg-[#EDF3F8] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3BBEFF] rounded-full transition-all duration-300"
                  style={{ width: `${item.widthPct}%` }}
                />
              </div>
              <div className="w-[65px] text-right text-[14px] font-bold text-[#176BA8] tabular-nums">
                {item.count}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
