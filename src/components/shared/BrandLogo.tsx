import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { FACE_SHAPE_META } from '../../data/initialData';
import { FaceShape } from '../../types/framefit';
import { audioEngine } from '../../utils/audioEngine';
import { OpticalFrameArt, SUPPORTED_SVG_FRAMES } from './OpticalFrameArt';

export const FrameFitLogo: React.FC<{ size?: 'xs' | 'sm' | 'lg' }> = ({ size = 'sm' }) => {
  const isLg = size === 'lg';
  const isXs = size === 'xs';
  return (
    <div className={`inline-flex flex-col items-center select-none ${isLg ? 'gap-1' : 'gap-0.5'}`}>
      <svg
        viewBox="0 0 220 96"
        className={
          isLg ? 'w-[420px] h-auto' : isXs ? 'w-[96px] h-auto' : 'w-[138px] h-auto'
        }
        aria-label="FRAME-FIT Logo"
      >
        {/* Sky blue rounded backing */}
        <rect x="4" y="4" width="212" height="88" rx="16" fill="#3BBEFF" />
        {/* Subtle center nose bridge shadow triangle */}
        <path d="M110 38 L88 86 L132 86 Z" fill="#2BA7EB" opacity="0.55" />
        {/* White glasses frame silhouette */}
        <path
          d="M12 18 C12 12 20 10 56 10 C82 10 92 16 100 26 C104 31 116 31 120 26 C128 16 138 10 164 10 C200 10 208 12 208 18 L206 32 C201 35 198 46 196 58 C192 78 176 86 154 86 C132 86 121 75 118 55 C116 42 104 42 102 55 C99 75 88 86 66 86 C44 86 28 78 24 58 C22 46 19 35 14 32 Z"
          fill="#FFFFFF"
        />
        {/* Left & Right subtle hinge accent dashes */}
        <rect x="20" y="19" width="12" height="4" rx="2" fill="#3BBEFF" />
        <rect x="188" y="19" width="12" height="4" rx="2" fill="#3BBEFF" />
        {/* Left lens blue cutout */}
        <path
          d="M32 25 C42 20 75 20 88 26 C95 30 96 42 94 55 C91 70 80 78 64 78 C46 78 34 70 31 54 C28 40 27 28 32 25 Z"
          fill="#3BBEFF"
        />
        {/* Right lens blue cutout */}
        <path
          d="M188 25 C178 20 145 20 132 26 C125 30 124 42 126 55 C129 70 140 78 156 78 C174 78 186 70 189 54 C192 40 193 28 188 25 Z"
          fill="#3BBEFF"
        />
        {/* White pupil circles */}
        <circle cx="62" cy="49" r="19" fill="#FFFFFF" />
        <circle cx="158" cy="49" r="19" fill="#FFFFFF" />
      </svg>
      <span
        className={`font-brand font-extrabold tracking-tight text-[#3BBEFF] leading-none ${
          isLg ? 'text-[92px] mt-1' : isXs ? 'text-[19px]' : 'text-[27px]'
        }`}
      >
        FRAME-FIT
      </span>
    </div>
  );
};

export const KioskHeader: React.FC<{
  centerPillText?: string;
  centerPlainText?: string;
  pillVariant?: 'blue' | 'yellow';
  compact?: boolean;
  onLogoClick?: () => void;
}> = ({
  centerPillText,
  centerPlainText,
  pillVariant = 'blue',
  compact = false,
  onLogoClick,
}) => {
  const [muted, setMuted] = useState(() => audioEngine.isMuted());

  useEffect(() => {
    return audioEngine.subscribeMute(setMuted);
  }, []);

  return (
    <header
      className={`kiosk-header-bg relative z-20 flex items-center justify-between shrink-0 ${
        compact ? 'px-8 h-[82px]' : 'px-10 h-[140px]'
      }`}
    >
      <div
        className={`flex items-center ${onLogoClick ? 'cursor-pointer' : ''}`}
        onClick={onLogoClick}
      >
        <FrameFitLogo size={compact ? 'xs' : 'sm'} />
      </div>

      <div className="flex-1 flex justify-center px-6">
        {centerPillText ? (
          <div
            className={`rounded-full font-mono-ui font-medium tracking-tight shadow-sm whitespace-nowrap transition-colors duration-300 ${
              compact ? 'px-7 py-1.5 text-[19px]' : 'px-9 py-2.5 text-[25px]'
            } ${
              pillVariant === 'yellow'
                ? `bg-[#FFD600] text-black font-semibold text-center ${
                    compact ? 'min-w-[340px]' : 'min-w-[540px]'
                  }`
                : 'bg-[#3BBEFF] text-white'
            }`}
          >
            {centerPillText}
          </div>
        ) : centerPlainText ? (
          <p
            className={`font-mono-ui text-black tracking-tight whitespace-nowrap ${
              compact ? 'text-[20px]' : 'text-[26px]'
            }`}
          >
            {centerPlainText}
          </p>
        ) : null}
      </div>

      <div
        className={`flex items-center justify-end ${
          compact ? 'gap-3 min-w-[190px]' : 'gap-4 min-w-[260px]'
        }`}
      >
        <div
          className={`text-right font-mono-ui leading-snug text-[#7A8189] ${
            compact ? 'text-[14px]' : 'text-[19px]'
          }`}
        >
          <div>(placeholder of</div>
          <div>eyewear company)</div>
        </div>
        <button
          type="button"
          onClick={() => audioEngine.toggleMute()}
          title={muted ? 'Unmute Kiosk Audio' : 'Mute Kiosk Audio'}
          aria-label={muted ? 'Unmute Kiosk Audio' : 'Mute Kiosk Audio'}
          className={`rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 border ${
            compact ? 'w-9 h-9' : 'w-10 h-10'
          } ${
            muted
              ? 'bg-[#FFEAEA] border-[#F2B8B8] text-[#C8232C]'
              : 'bg-[#EAF6FF] border-[#BCE2FC] text-[#176BA8] hover:bg-[#D8EEFF]'
          }`}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};

export const ProceedButton: React.FC<{
  disabled?: boolean;
  onClick?: () => void;
  label?: string;
  countdownSecs?: number | null;
  className?: string;
}> = ({
  disabled = false,
  onClick,
  label = 'Proceed',
  countdownSecs = null,
  className = '',
}) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-4 min-h-[54px] px-10 py-2.5 rounded-full font-mono-ui text-[24px] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#3BBEFF] ${
        disabled
          ? 'bg-[#C9CFD6] text-[#838A92] cursor-not-allowed shadow-none'
          : 'bg-[#176BA8] hover:bg-[#135A8E] active:scale-[0.98] text-white cursor-pointer shadow-[0_6px_14px_rgba(12,62,102,0.28)]'
      } ${className}`}
    >
      <span>{label}</span>
      <svg viewBox="0 0 20 20" className="w-5 h-5 fill-current shrink-0" aria-hidden="true">
        <polygon points="3,2 18,10 3,18" />
      </svg>
      {countdownSecs !== null && (
        <span className="text-[16px] opacity-90 ml-1 tabular-nums">{countdownSecs} secs</span>
      )}
    </button>
  );
};

export const ReturnButton: React.FC<{
  onClick?: () => void;
  label?: string;
  variant?: 'grey' | 'blue';
  countdownSecs?: number | null;
  className?: string;
}> = ({
  onClick,
  label = 'Return',
  variant = 'grey',
  countdownSecs = null,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-5 min-h-[54px] px-12 py-2.5 rounded-full font-mono-ui text-[24px] cursor-pointer transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#3BBEFF] ${
        variant === 'blue'
          ? 'bg-[#176BA8] hover:bg-[#135A8E] text-white shadow-[0_6px_14px_rgba(12,62,102,0.28)]'
          : 'bg-[#90979E] hover:bg-[#7D848B] text-white shadow-[0_5px_12px_rgba(0,0,0,0.2)]'
      } ${className}`}
    >
      <span>{label}</span>
      {countdownSecs !== null && (
        <span className="text-[16px] opacity-90 tabular-nums">{countdownSecs} secs</span>
      )}
    </button>
  );
};

export const HalftoneDots: React.FC<{
  side: 'left' | 'right';
  color: string;
  opacity?: number;
  className?: string;
}> = ({ side, color, opacity = 0.65, className = '' }) => {
  const cols = 12;
  const rows = 24;
  const dots: React.ReactNode[] = [];

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      // Radial arc intensity greatest on outer edge & vertically centered
      const edgeFactor = side === 'right' ? c / (cols - 1) : (cols - 1 - c) / (cols - 1);
      const yDist = Math.abs(r / (rows - 1) - 0.5) * 2;
      const strength = Math.max(0, edgeFactor * 1.15 - yDist * 0.45);
      if (strength <= 0.14) continue;
      const radius = 1.5 + strength * 7.5;
      const cx = c * 28 + 14;
      const cy = r * 38 + 19;
      dots.push(
        <circle
          key={`${c}-${r}`}
          cx={cx}
          cy={cy}
          r={radius}
          fill={color}
          fillOpacity={Math.min(1, opacity * (0.35 + strength * 0.65))}
        />
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${cols * 28} ${rows * 38}`}
      preserveAspectRatio="none"
      className={`pointer-events-none select-none ${className}`}
      aria-hidden="true"
    >
      {dots}
    </svg>
  );
};

export const FaceShapeIcon: React.FC<{ shape: FaceShape; className?: string }> = ({
  shape,
  className = 'w-6 h-6',
}) => {
  switch (shape) {
    case 'Oval':
      return (
        <svg viewBox="0 0 32 24" className={className} aria-hidden="true">
          <ellipse cx="16" cy="12" rx="14" ry="8.5" fill="currentColor" />
        </svg>
      );
    case 'Round':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="currentColor" />
        </svg>
      );
    case 'Square':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="1.5" fill="currentColor" />
        </svg>
      );
    case 'Heart':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill="currentColor"
          />
        </svg>
      );
    case 'Diamond':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <polygon points="12,1 22,12 12,23 2,12" fill="currentColor" />
        </svg>
      );
    case 'Oblong':
      return (
        <svg viewBox="0 0 32 24" className={className} aria-hidden="true">
          <rect x="2" y="4" width="28" height="16" rx="8" fill="currentColor" />
        </svg>
      );
    case 'Triangle':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <polygon points="12,2 22,21 2,21" fill="currentColor" />
        </svg>
      );
  }
};

export const FaceShapeChip: React.FC<{
  shape: FaceShape;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  removable?: boolean;
  onClick?: () => void;
  className?: string;
}> = ({
  shape,
  size = 'md',
  active = false,
  removable = false,
  onClick,
  className = '',
}) => {
  const meta = FACE_SHAPE_META[shape];
  const sizeClasses =
    size === 'sm'
      ? 'px-4 py-1.5 text-[15px] gap-2.5'
      : size === 'lg'
      ? 'px-8 py-3 text-[24px] gap-4'
      : 'px-6 py-2 text-[19px] gap-3';

  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      style={{ backgroundColor: meta.color, color: meta.textColor }}
      className={`inline-flex items-center justify-between rounded-full font-mono-ui shadow-[0_4px_10px_rgba(0,0,0,0.18)] transition-transform ${
        onClick ? 'cursor-pointer hover:brightness-110 active:scale-[0.98]' : ''
      } ${active ? 'ring-4 ring-[#176BA8] ring-offset-2' : ''} ${sizeClasses} ${className}`}
    >
      <span>{meta.label}</span>
      <span className="inline-flex items-center gap-2 shrink-0">
        <FaceShapeIcon shape={shape} className={size === 'lg' ? 'w-7 h-7' : 'w-5 h-5'} />
        {removable && <span className="text-[16px] font-bold ml-1 opacity-90">✕</span>}
      </span>
    </Tag>
  );
};

export const FrameVisual: React.FC<{
  imageUrl: string;
  alt: string;
  className?: string;
}> = ({ imageUrl, alt, className = 'w-full h-full object-contain' }) => {
  if (SUPPORTED_SVG_FRAMES.has(imageUrl)) {
    return <OpticalFrameArt frameKey={imageUrl} alt={alt} className={className} />;
  }
  if (imageUrl === 'svg:aviator') {
    return (
      <svg viewBox="0 0 260 110" className={className} aria-label={alt}>
        <g fill="none" stroke="#8C6D32" strokeWidth="4.5" strokeLinecap="round">
          <path d="M22 30 H238" />
          <path d="M108 42 Q130 34 152 42" />
          <path d="M22 34 C22 72 45 92 78 90 C105 88 116 64 114 40 C112 31 96 28 65 28 C34 28 22 30 22 34 Z" fill="rgba(180,210,235,0.18)" />
          <path d="M238 34 C238 72 215 92 182 90 C155 88 144 64 146 40 C148 31 164 28 195 28 C226 28 238 30 238 34 Z" fill="rgba(180,210,235,0.18)" />
        </g>
      </svg>
    );
  }
  if (imageUrl === 'svg:cateye') {
    return (
      <svg viewBox="0 0 260 110" className={className} aria-label={alt}>
        <g fill="none" stroke="#5D1C2E" strokeWidth="7" strokeLinejoin="round">
          <path d="M12 24 C42 20 88 26 112 42 C116 74 96 90 66 90 C36 90 22 68 20 42 Z" fill="rgba(255,245,248,0.35)" />
          <path d="M248 24 C218 20 172 26 148 42 C144 74 164 90 194 90 C224 90 238 68 240 42 Z" fill="rgba(255,245,248,0.35)" />
          <path d="M112 42 Q130 35 148 42" strokeWidth="6" />
        </g>
      </svg>
    );
  }
  if (imageUrl === 'svg:square') {
    return (
      <svg viewBox="0 0 260 110" className={className} aria-label={alt}>
        <g fill="none" stroke="#36414C" strokeWidth="6" strokeLinejoin="round">
          <rect x="20" y="24" width="94" height="62" rx="10" fill="rgba(220,235,248,0.2)" />
          <rect x="146" y="24" width="94" height="62" rx="10" fill="rgba(220,235,248,0.2)" />
          <path d="M114 40 Q130 33 146 40" />
          <path d="M8 32 H20 M240 32 H252" />
        </g>
      </svg>
    );
  }
  return (
    <img
      src={imageUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      draggable={false}
    />
  );
};
