import React, { useState } from 'react';
import { AdminTabId, StaffAccount } from '../../types/framefit';
import { KioskHeader, ReturnButton } from '../shared/BrandLogo';

interface AdminLayoutProps {
  staff: StaffAccount;
  activeTab: AdminTabId;
  onChangeTab: (tab: AdminTabId) => void;
  onConfirmLogout: () => void;
  children: React.ReactNode;
}

const SIDEBAR_ITEMS: { id: AdminTabId; icon: string; label: string }[] = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'frame-catalog', icon: '🕶️', label: 'Frame Catalog' },
  { id: 'lens-catalog', icon: '🔍', label: 'Lens Catalog' },
  { id: 'rules-engine', icon: '🧠', label: 'Rules Engine' },
  { id: 'reports', icon: '📈', label: 'Reports' },
  { id: 'system-logs', icon: '⚙️', label: 'System Logs' },
];

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  staff,
  activeTab,
  onChangeTab,
  onConfirmLogout,
  children,
}) => {
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  return (
    <div className="w-full h-screen flex flex-col bg-[#EAF7FF] overflow-hidden">
      <KioskHeader centerPillText="Admin Interface" pillVariant="yellow" compact />

      <div className="kiosk-bg-gradient flex-1 min-h-0 flex flex-col px-6 lg:px-10 pt-3 pb-3 overflow-y-auto admin-scroll">
        {/* Welcome, (Staff Name) sky-blue bar */}
        <div className="w-full bg-[#3BBEFF] rounded-full py-1.5 px-6 text-center font-mono-ui text-[18px] lg:text-[20px] text-white shadow-xs shrink-0 mb-3.5">
          Welcome, <span className="text-[#FFD600] italic font-semibold">{staff.displayName}</span>
        </div>

        {/* Two-column body: Left white sidebar card + Right pale lavender-grey content panel */}
        <div className="flex-1 flex gap-5 min-h-[420px]">
          {/* Left Navigation Card */}
          <aside className="w-[225px] lg:w-[250px] bg-white rounded-[24px] p-4 shadow-[0_6px_20px_rgba(24,92,138,0.08)] flex flex-col justify-between shrink-0 overflow-y-auto admin-scroll">
            <nav className="space-y-1.5" aria-label="Admin Interface Navigation">
              {SIDEBAR_ITEMS.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeTab(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-mono-ui text-[15px] lg:text-[16px] text-left cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#EDF8FF] text-black font-semibold'
                        : 'text-[#1F2937] hover:bg-[#F5FAFF]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="text-[19px] leading-none" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </span>
                    {active && (
                      <span className="text-black text-[14px] leading-none" aria-hidden="true">
                        ◀
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="pt-3 mt-3 border-t border-[#E5EEF5] font-mono-ui text-[12px] text-[#6B747E] px-2">
              <div className="font-semibold text-[#1A5878]">{staff.role}</div>
              <div>MIS Stores D1–D6 Active</div>
            </div>
          </aside>

          {/* Right Lavender-Grey Content Container */}
          <section className="flex-1 bg-[#E9E8F5] rounded-[24px] p-5 overflow-y-auto admin-scroll shadow-inner min-w-0">
            {children}
          </section>
        </div>
      </div>

      {/* Bottom White Footer with Red Log-out Pill */}
      <footer className="kiosk-footer-bg h-[56px] shrink-0 px-10 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setLogoutDialogOpen(true)}
          className="bg-[#CF3434] hover:bg-[#B22626] active:scale-[0.98] text-white px-8 py-1.5 rounded-full font-mono-ui text-[17px] font-medium shadow-[0_4px_10px_rgba(160,30,30,0.28)] cursor-pointer transition-all"
        >
          Log-out
        </button>
      </footer>

      {/* Confirm Log-out Modal (6.7) */}
      {logoutDialogOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#3C4B57]/72 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLogoutDialogOpen(false);
          }}
        >
          <div className="w-[680px] max-w-[92vw] bg-white rounded-[32px] p-9 shadow-2xl flex flex-col gap-7">
            <div className="w-full bg-[#3BBEFF] text-white text-center py-2.5 rounded-full font-mono-ui text-[26px] font-medium">
              Confirm Log-out?
            </div>

            <p className="font-mono-ui text-[19px] text-center text-[#374151]">
              Are you sure you want to end your Administrator session?
            </p>

            <div className="flex items-center justify-center gap-8 pt-2">
              <button
                type="button"
                onClick={() => {
                  setLogoutDialogOpen(false);
                  onConfirmLogout();
                }}
                className="w-[210px] h-[52px] rounded-full bg-[#CF3434] hover:bg-[#B22626] text-white font-mono-ui text-[22px] font-medium shadow-md cursor-pointer"
              >
                Yes
              </button>

              <ReturnButton
                label="No"
                onClick={() => {
                  setLogoutDialogOpen(false);
                  onChangeTab('dashboard');
                }}
                className="w-[210px]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
