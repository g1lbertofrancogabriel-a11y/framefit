import { useCallback, useEffect, useState } from 'react';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminFrameCatalog } from './components/admin/AdminFrameCatalog';
import { AdminLayout } from './components/admin/AdminLayout';
import { AdminLensCatalog } from './components/admin/AdminLensCatalog';
import { AdminLoginView } from './components/admin/AdminLoginModal';
import { AdminReports } from './components/admin/AdminReports';
import { AdminRulesEngine } from './components/admin/AdminRulesEngine';
import { AdminSystemLogs } from './components/admin/AdminSystemLogs';
import { KioskFlow } from './components/kiosk/KioskFlow';
import { audioEngine } from './utils/audioEngine';
import {
  DEFAULT_RULES_ENGINE,
  INITIAL_ACCESS_LOGS,
  INITIAL_ERROR_LOGS,
  INITIAL_FRAMES,
  INITIAL_LENS_CATALOG,
  INITIAL_USAGE_SESSIONS,
} from './data/initialData';
import {
  AdminAccessLog,
  AdminTabId,
  FrameItem,
  LensCatalogStore,
  RulesEngineStore,
  StaffAccount,
  SystemErrorLog,
  UsageSessionRecord,
} from './types/framefit';

function formatTimestampNow(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export default function App() {
  // Detect direct PC browser /admin entry
  const initialIsAdminPath =
    typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/admin') ||
      window.location.hash.startsWith('#/admin'));

  const [entryOrigin, setEntryOrigin] = useState<'kiosk' | 'pc-admin'>(
    initialIsAdminPath ? 'pc-admin' : 'kiosk'
  );
  const [loggedInStaff, setLoggedInStaff] = useState<StaffAccount | null>(null);
  const [adminTab, setAdminTab] = useState<AdminTabId>('dashboard');
  const [highlightedFrameId, setHighlightedFrameId] = useState<string | null>(null);

  // Live MIS Data Stores (D1-D6)
  const [frames, setFrames] = useState<FrameItem[]>(INITIAL_FRAMES); // D1 & D2
  const [rulesEngine, setRulesEngine] = useState<RulesEngineStore>(DEFAULT_RULES_ENGINE); // D3
  const [usageSessions, setUsageSessions] =
    useState<UsageSessionRecord[]>(INITIAL_USAGE_SESSIONS); // D4
  const [accessLogs, setAccessLogs] = useState<AdminAccessLog[]>(INITIAL_ACCESS_LOGS); // D5
  const [errorLogs, setErrorLogs] = useState<SystemErrorLog[]>(INITIAL_ERROR_LOGS); // D5
  const [lensCatalog, setLensCatalog] = useState<LensCatalogStore>(INITIAL_LENS_CATALOG); // D6

  const recordAccessLog = useCallback(
    (
      username: string,
      device: 'Kiosk-01' | 'Store-PC',
      result: 'Success' | 'Failed' | 'Locked Out' | 'Logged Out'
    ) => {
      setAccessLogs((prev) => [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          username,
          timestamp: formatTimestampNow(),
          device,
          result,
        },
        ...prev,
      ]);
    },
    []
  );

  const handleRecordSessionComplete = useCallback(
    (session: UsageSessionRecord, purchasedFrameId: string) => {
      setUsageSessions((prev) => [session, ...prev]);
      setFrames((prev) =>
        prev.map((f) => {
          const isFav = session.favoritedFrameIds.includes(f.id);
          const isChosen = f.id === purchasedFrameId;
          return {
            ...f,
            stock: isChosen ? Math.max(0, f.stock - 1) : f.stock,
            favoriteCount: isFav ? f.favoriteCount + 1 : f.favoriteCount,
          };
        })
      );
    },
    []
  );

  // Strictly queued after "Opening the Admin Interface..." once dashboard mounts
  useEffect(() => {
    if (loggedInStaff) {
      void audioEngine.speak('Welcome to the Admin Interface!');
    }
  }, [loggedInStaff]);

  const handleAdminLogout = () => {
    if (loggedInStaff) {
      recordAccessLog(
        `${loggedInStaff.username} (${loggedInStaff.displayName})`,
        entryOrigin === 'pc-admin' ? 'Store-PC' : 'Kiosk-01',
        'Logged Out'
      );
    }
    audioEngine.clearVoiceQueue();
    setLoggedInStaff(null);
    setAdminTab('dashboard');
    setHighlightedFrameId(null);
  };

  // Case 1: Logged into Admin Interface (from either Kiosk or Store-PC /admin)
  if (loggedInStaff) {
    return (
      <AdminLayout
        staff={loggedInStaff}
        activeTab={adminTab}
        onChangeTab={(tab) => setAdminTab(tab)}
        onConfirmLogout={handleAdminLogout}
      >
        {adminTab === 'dashboard' && (
          <AdminDashboard
            frames={frames}
            usageSessions={usageSessions}
            onInspectLowStockFrame={(fid) => {
              setHighlightedFrameId(fid);
              setAdminTab('frame-catalog');
            }}
          />
        )}

        {adminTab === 'frame-catalog' && (
          <AdminFrameCatalog
            frames={frames}
            highlightedFrameId={highlightedFrameId}
            onClearHighlight={() => setHighlightedFrameId(null)}
            onAddFrame={(newFrame) => setFrames((prev) => [newFrame, ...prev])}
            onUpdateFrame={(updated) =>
              setFrames((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
            }
            onDeleteFrame={(fid) =>
              setFrames((prev) => prev.filter((f) => f.id !== fid))
            }
          />
        )}

        {adminTab === 'lens-catalog' && (
          <AdminLensCatalog
            lensCatalog={lensCatalog}
            onSaveLensCatalog={(next) => setLensCatalog(next)}
          />
        )}

        {adminTab === 'rules-engine' && (
          <AdminRulesEngine
            rules={rulesEngine}
            onSaveRules={(next) => setRulesEngine(next)}
          />
        )}

        {adminTab === 'reports' && (
          <AdminReports frames={frames} usageSessions={usageSessions} />
        )}

        {adminTab === 'system-logs' && (
          <AdminSystemLogs
            accessLogs={accessLogs}
            errorLogs={errorLogs}
            onResolveError={(eid) =>
              setErrorLogs((prev) =>
                prev.map((e) => (e.id === eid ? { ...e, status: 'Resolved' } : e))
              )
            }
          />
        )}
      </AdminLayout>
    );
  }

  // Case 2: Direct Store-PC /admin Login Page
  if (entryOrigin === 'pc-admin') {
    return (
      <AdminLoginView
        mode="page"
        device="Store-PC"
        onRecordLog={(uname, res) => recordAccessLog(uname, 'Store-PC', res)}
        onSuccess={(staff) => {
          setAdminTab('dashboard');
          setLoggedInStaff(staff);
        }}
        onSwitchToKiosk={() => {
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', '/');
          }
          setEntryOrigin('kiosk');
        }}
      />
    );
  }

  // Case 3: Customer Kiosk Flow (P1-P22 + hidden 3-tap admin trigger)
  return (
    <KioskFlow
      frames={frames}
      lensCatalog={lensCatalog}
      rulesEngine={rulesEngine}
      onRecordAccessLog={recordAccessLog}
      onAdminLoginSuccess={(staff) => {
        setEntryOrigin('kiosk');
        setAdminTab('dashboard');
        setLoggedInStaff(staff);
      }}
      onRecordSessionComplete={handleRecordSessionComplete}
    />
  );
}
