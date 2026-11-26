import React, { useState } from 'react';
import { AdminAccessLog, SystemErrorLog } from '../../types/framefit';

interface SystemLogsProps {
  accessLogs: AdminAccessLog[];
  errorLogs: SystemErrorLog[];
  onResolveError: (id: string) => void;
}

export const AdminSystemLogs: React.FC<SystemLogsProps> = ({
  accessLogs,
  errorLogs,
  onResolveError,
}) => {
  const [lastBackup, setLastBackup] = useState('2026-11-23 08:00:00');
  const [backupProgress, setBackupProgress] = useState<number | null>(null);
  const [backupSuccess, setBackupSuccess] = useState(false);

  const handleRunBackup = () => {
    if (backupProgress !== null) return;
    setBackupSuccess(false);
    setBackupProgress(15);
    window.setTimeout(() => setBackupProgress(55), 250);
    window.setTimeout(() => setBackupProgress(90), 550);
    window.setTimeout(() => {
      setBackupProgress(null);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
        now.getHours()
      )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      setLastBackup(stamp);
      setBackupSuccess(true);
      window.setTimeout(() => setBackupSuccess(false), 3000);
    }, 850);
  };

  return (
    <div className="flex flex-col gap-6 font-mono-ui">
      {/* Database Backup Panel */}
      <div className="bg-white rounded-[26px] p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-[21px] font-semibold text-[#176BA8]">
            Local Database Backup (D1, D2 & D6 Catalogs)
          </h3>
          <div className="text-[14px] text-[#4B5563]">
            Last backup: <span className="font-bold text-black">{lastBackup}</span>
          </div>
          {backupProgress !== null && (
            <div className="w-[340px] h-3 bg-[#DCE6EE] rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-[#3BBEFF] transition-all duration-200"
                style={{ width: `${backupProgress}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {backupSuccess && (
            <span className="bg-[#8FFF00] text-black px-5 py-1.5 rounded-full text-[14px] font-bold">
              ✓ Local Backup Complete
            </span>
          )}
          <button
            type="button"
            onClick={handleRunBackup}
            disabled={backupProgress !== null}
            className="bg-[#176BA8] hover:bg-[#135A8E] disabled:opacity-60 text-white px-8 py-3 rounded-full text-[17px] font-medium shadow cursor-pointer"
          >
            {backupProgress !== null ? 'Backing Up...' : 'Trigger Local Backup'}
          </button>
        </div>
      </div>

      {/* Admin Access Logs (D5) */}
      <div className="bg-white rounded-[26px] p-6 shadow-xs space-y-3">
        <h3 className="text-[21px] font-semibold text-[#176BA8]">
          Admin Access Logs (Data Store D5)
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-[#DCE5EE]">
          <table className="w-full text-left border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#3BBEFF] text-white">
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Device</th>
                <th className="py-3 px-4">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6ECF3]">
              {accessLogs.map((log) => (
                <tr key={log.id} className="bg-white">
                  <td className="py-3 px-4 font-semibold text-black">{log.username}</td>
                  <td className="py-3 px-4 tabular-nums text-[#374151]">{log.timestamp}</td>
                  <td className="py-3 px-4 text-[#1A5878] font-medium">{log.device}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-3 py-0.5 rounded-full text-[12px] font-bold ${
                        log.result === 'Success'
                          ? 'bg-[#8FFF00] text-black'
                          : log.result === 'Logged Out'
                          ? 'bg-[#D7F0FF] text-[#176BA8]'
                          : 'bg-[#FFE1E1] text-[#CF3434]'
                      }`}
                    >
                      {log.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error Logs */}
      <div className="bg-white rounded-[26px] p-6 shadow-xs space-y-3">
        <h3 className="text-[21px] font-semibold text-[#176BA8]">System & Camera Error Logs</h3>
        <div className="overflow-x-auto rounded-2xl border border-[#DCE5EE]">
          <table className="w-full text-left border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#3BBEFF] text-white">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Device</th>
                <th className="py-3 px-4">Error Type</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6ECF3]">
              {errorLogs.map((err) => (
                <tr key={err.id} className="bg-white">
                  <td className="py-3 px-4 tabular-nums whitespace-nowrap">{err.timestamp}</td>
                  <td className="py-3 px-4 font-medium text-[#1A5878]">{err.device}</td>
                  <td className="py-3 px-4 font-semibold text-black">{err.errorType}</td>
                  <td className="py-3 px-4 text-[#4B5563]">{err.description}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {err.status === 'Open' ? (
                      <button
                        type="button"
                        onClick={() => onResolveError(err.id)}
                        className="bg-[#FFA629] hover:bg-[#E89116] text-white px-4 py-1 rounded-full text-[12px] font-bold cursor-pointer"
                      >
                        Open · Mark Resolved
                      </button>
                    ) : (
                      <span className="bg-[#E5F7D8] text-[#1D6B12] px-3.5 py-1 rounded-full text-[12px] font-bold">
                        Resolved
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
