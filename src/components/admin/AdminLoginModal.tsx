import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { STAFF_ACCOUNTS } from '../../data/initialData';
import { StaffAccount } from '../../types/framefit';
import { audioEngine } from '../../utils/audioEngine';
import { FrameFitLogo, HalftoneDots, ProceedButton } from '../shared/BrandLogo';

interface AdminLoginProps {
  mode: 'modal' | 'page';
  device: 'Kiosk-01' | 'Store-PC';
  onClose?: () => void;
  onSuccess: (staff: StaffAccount) => void;
  onRecordLog: (username: string, result: 'Success' | 'Failed' | 'Locked Out') => void;
  onSwitchToKiosk?: () => void;
}

export const AdminLoginView: React.FC<AdminLoginProps> = ({
  mode,
  device,
  onClose,
  onSuccess,
  onRecordLog,
  onSwitchToKiosk,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Visual feedback & transition states
  const [shakeCount, setShakeCount] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const authTimerRef = useRef<number | null>(null);
  const progressRafRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (authTimerRef.current) window.clearTimeout(authTimerRef.current);
      if (progressRafRef.current) cancelAnimationFrame(progressRafRef.current);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setLockoutSeconds((s) => {
        if (s <= 1) {
          window.clearInterval(timer);
          setFailedAttempts(0);
          setErrorMsg('');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockoutSeconds]);

  const canSubmit =
    username.trim().length > 0 &&
    password.length > 0 &&
    lockoutSeconds === 0 &&
    !isAuthenticating &&
    !isClosing;

  const handleExitClick = () => {
    if (isClosing || isAuthenticating || !onClose) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setUsername('');
      setPassword('');
      setShowPassword(false);
      setErrorMsg('');
      onClose();
    }, 210);
  };

  const attemptLogin = () => {
    if (!canSubmit) return;

    audioEngine.unlockAndPreload();

    const trimmedUser = username.trim();
    // Username: case-insensitive, Password: case-sensitive
    const match = STAFF_ACCOUNTS.find(
      (acc) => acc.username.toLowerCase() === trimmedUser.toLowerCase() && acc.password === password
    );

    if (match) {
      onRecordLog(`${match.username} (${match.displayName})`, 'Success');
      setErrorMsg('');
      setFailedAttempts(0);
      setIsAuthenticating(true);
      setLoadProgress(6);

      // Voice line 1 on valid login while showing 2.4s loading transition
      void audioEngine.speak('Opening the Admin Interface...');

      const startTime = performance.now();
      const durationMs = 2400;
      const stepBar = (now: number) => {
        const pct = Math.min(100, Math.round(6 + ((now - startTime) / durationMs) * 94));
        setLoadProgress(pct);
        if (now - startTime < durationMs) {
          progressRafRef.current = requestAnimationFrame(stepBar);
        }
      };
      progressRafRef.current = requestAnimationFrame(stepBar);

      authTimerRef.current = window.setTimeout(() => {
        onSuccess(match);
      }, durationMs);
    } else {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      setShakeCount((c) => c + 1);
      if (nextAttempts >= 3) {
        setLockoutSeconds(60);
        setErrorMsg('Too many failed attempts. Log-in locked for 1 minute.');
        onRecordLog(trimmedUser, 'Locked Out');
      } else {
        setErrorMsg('Invalid username or password.');
        onRecordLog(trimmedUser, 'Failed');
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    attemptLogin();
  };

  const loginCard = (
    <div
      key={shakeCount > 0 ? `shake-${shakeCount}` : 'steady'}
      style={{
        animation: isClosing
          ? 'modalCardOut 0.21s ease-in forwards'
          : shakeCount > 0
          ? 'modalShake 0.45s ease-in-out'
          : 'modalCardIn 0.24s ease-out',
      }}
      className="relative flex flex-col items-center"
    >
      {/* Top Circular Yellow Key Badge */}
      <div className="relative z-10 -mb-9 w-[112px] h-[112px] rounded-full bg-white shadow-lg flex items-center justify-center">
        <div className="w-[90px] h-[90px] rounded-full bg-[#FFD600] flex items-center justify-center">
          <svg viewBox="0 0 48 48" className="w-12 h-12 fill-black" aria-hidden="true">
            <circle cx="34" cy="24" r="9.5" />
            <circle cx="34" cy="24" r="3.8" fill="#FFD600" />
            <rect x="7" y="21.5" width="20" height="5" rx="1.5" />
            <rect x="9" y="25" width="4.5" height="6.5" rx="1" />
            <rect x="16" y="25" width="4.5" height="5" rx="1" />
          </svg>
        </div>
      </div>

      {/* Login White/Sky Card matching PDF Page 24 */}
      <form
        onSubmit={handleSubmit}
        className="w-[760px] max-w-[92vw] bg-gradient-to-b from-[#FFFFFF] to-[#EAF7FF] rounded-[34px] px-10 pt-14 pb-8 shadow-2xl flex flex-col gap-5"
      >
        {/* Yellow Title Bar with optional top-right Circular Exit Button */}
        <div className="relative w-full bg-[#FFD600] text-black text-center py-2.5 px-14 rounded-full font-mono-ui text-[25px] font-semibold flex items-center justify-center">
          <span>Administration Control Log-in:</span>
          {mode === 'modal' && onClose && (
            <button
              type="button"
              onClick={handleExitClick}
              disabled={isAuthenticating}
              aria-label="Close Administration Control Log-in"
              title="Exit"
              className="absolute right-2 w-[38px] h-[38px] rounded-full bg-white/90 hover:bg-white active:scale-90 text-black shadow-sm flex items-center justify-center cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="w-5 h-5 stroke-[2.6]" />
            </button>
          )}
        </div>

        <div className="space-y-4 pt-1">
          <div className="flex items-center gap-4">
            <label
              htmlFor="admin-username"
              className="w-[215px] bg-[#FFD600] text-black text-center py-2.5 rounded-full font-mono-ui text-[22px] font-medium shrink-0"
            >
              Username
            </label>
            <input
              id="admin-username"
              type="text"
              autoFocus
              autoComplete="username"
              disabled={lockoutSeconds > 0 || isAuthenticating}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter staff username"
              className="flex-1 h-[52px] bg-white rounded-full px-6 font-mono-ui text-[20px] text-black outline-none border border-[#DCE6EE] focus:ring-3 focus:ring-[#FFD600] disabled:bg-slate-100"
            />
          </div>

          <div className="flex items-center gap-4">
            <label
              htmlFor="admin-password"
              className="w-[215px] bg-[#FFD600] text-black text-center py-2.5 rounded-full font-mono-ui text-[22px] font-medium shrink-0"
            >
              Password
            </label>
            <div className="relative flex-1 flex items-center">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                disabled={lockoutSeconds > 0 || isAuthenticating}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter staff password"
                className="w-full h-[52px] bg-white rounded-full pl-6 pr-14 font-mono-ui text-[20px] text-black outline-none border border-[#DCE6EE] focus:ring-3 focus:ring-[#FFD600] disabled:bg-slate-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={lockoutSeconds > 0 || isAuthenticating}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 w-9 h-9 rounded-full flex items-center justify-center text-[#5A6775] hover:text-black hover:bg-[#F1F5F9] cursor-pointer transition-colors disabled:opacity-40"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Inline Error or Lockout Banner */}
        {(errorMsg || lockoutSeconds > 0) && !isAuthenticating && (
          <div
            role="alert"
            className="bg-[#FFE5E5] border border-[#CF3434] text-[#B31F1F] rounded-2xl px-5 py-2.5 font-mono-ui text-[16px] text-center font-medium"
          >
            {lockoutSeconds > 0
              ? `Too many failed attempts. Log-in locked for ${lockoutSeconds}s.`
              : `${errorMsg} (${3 - failedAttempts} attempt${
                  3 - failedAttempts === 1 ? '' : 's'
                } remaining)`}
          </div>
        )}

        {/* Loading Transition Bar when Credentials Succeed */}
        {isAuthenticating ? (
          <div className="flex flex-col items-center gap-3 pt-2 pb-1">
            <div className="font-mono-ui text-[19px] font-semibold text-[#176BA8]">
              Opening Admin Interface...
            </div>
            <div className="w-full max-w-[440px] h-[16px] bg-[#DDE7F0] rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full bg-[#FFD600] rounded-full transition-all duration-75"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 pt-1">
            <ProceedButton
              disabled={!canSubmit}
              onClick={attemptLogin}
              className="w-[330px]"
            />
            <button type="submit" className="hidden" aria-hidden="true" />
            <p className="font-mono-ui text-[13px] text-[#64707C] text-center">
              Device: {device} · Authorized Staff Access Only
            </p>
          </div>
        )}
      </form>
    </div>
  );

  if (mode === 'modal') {
    return (
      <div
        style={{
          animation: isClosing
            ? 'modalBackdropOut 0.21s ease-in forwards'
            : 'modalBackdropIn 0.2s ease-out',
        }}
        className="fixed inset-0 z-50 bg-[#3B4954]/70 flex items-center justify-center"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleExitClick();
        }}
      >
        {loginCard}
      </div>
    );
  }

  // Full desktop page mode (/admin)
  return (
    <div className="min-h-screen w-full kiosk-bg-gradient relative overflow-hidden flex flex-col items-center justify-center p-6">
      <HalftoneDots
        side="right"
        color="#6AC9FF"
        opacity={0.45}
        className="absolute right-0 top-0 bottom-0 w-[30%] h-full"
      />
      <div className="relative z-10 flex flex-col items-center gap-8">
        <FrameFitLogo size="sm" />
        {loginCard}
        {onSwitchToKiosk && (
          <button
            type="button"
            onClick={onSwitchToKiosk}
            className="font-mono-ui text-[15px] text-[#176BA8] hover:underline cursor-pointer"
          >
            ← Open Customer Kiosk Interface
          </button>
        )}
      </div>
    </div>
  );
};
