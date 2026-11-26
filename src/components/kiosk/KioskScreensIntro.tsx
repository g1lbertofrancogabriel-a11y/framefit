import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { CustomerPrescription } from '../../types/framefit';
import { audioEngine, HOME_WELCOME_PHRASE } from '../../utils/audioEngine';
import { formatPeso } from '../../utils/recommendation';
import {
  FrameFitLogo,
  HalftoneDots,
  KioskHeader,
  ProceedButton,
  ReturnButton,
} from '../shared/BrandLogo';

interface Screen1Props {
  onStartSession: () => void;
  onAvatarTap: () => void;
  adminKeyState: 'hidden' | 'visible' | 'hiding';
  onOpenAdminLogin: () => void;
}

const OpeningHalftoneBackdrop: React.FC = () => {
  const dots: React.ReactNode[] = [];
  const cols = 25;
  const rows = 22;
  const pitch = 39;
  const cx = 425;
  const cy = 445;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * pitch + 14;
      const y = r * pitch + 18;
      const dx = (x - cx) / 530;
      const dy = (y - cy) / 425;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1.05) continue;

      // Peak dot size around mid-right behind the sweater/START circle edge, tapering outward
      const radialFalloff = Math.max(0, 1 - dist);
      const rightBoost = Math.min(1.25, Math.max(0.45, (x + 120) / 720));
      const radius = Math.max(1.8, Math.min(16.2, radialFalloff * rightBoost * 16.5));
      if (radius < 2.2) continue;

      dots.push(
        <circle
          key={`${c}-${r}`}
          cx={x}
          cy={y}
          r={radius.toFixed(1)}
          fill="#AEE4FF"
        />
      );
    }
  }

  return (
    <svg
      viewBox="0 0 1000 850"
      aria-hidden="true"
      className="pointer-events-none select-none absolute left-0 bottom-0 w-[1000px] h-[850px] z-0"
    >
      {dots}
    </svg>
  );
};

export const KioskScreen1Welcome: React.FC<Screen1Props> = ({
  onStartSession,
  onAvatarTap,
  adminKeyState,
  onOpenAdminLogin,
}) => {
  const [muted, setMuted] = useState(() => audioEngine.isMuted());

  useEffect(() => {
    return audioEngine.subscribeMute(setMuted);
  }, []);

  const avatarBreathRef = useRef<HTMLDivElement | null>(null);
  const eyesWrapRef = useRef<SVGSVGElement | null>(null);
  const leftEyelidFillRef = useRef<SVGPathElement | null>(null);
  const leftEyelidCreaseRef = useRef<SVGPathElement | null>(null);
  const leftEyelashLineRef = useRef<SVGPathElement | null>(null);
  const rightEyelidFillRef = useRef<SVGPathElement | null>(null);
  const rightEyelidCreaseRef = useRef<SVGPathElement | null>(null);
  const rightEyelashLineRef = useRef<SVGPathElement | null>(null);

  const mouthWrapRef = useRef<SVGSVGElement | null>(null);
  const mouthClipPathRef = useRef<SVGPathElement | null>(null);
  const upperLipFillRef = useRef<SVGPathElement | null>(null);
  const lowerLipFillRef = useRef<SVGPathElement | null>(null);
  const lowerLipSheenRef = useRef<SVGPathElement | null>(null);
  const chinShadowRef = useRef<SVGPathElement | null>(null);
  const mouthCavityRef = useRef<SVGPathElement | null>(null);
  const mouthTeethRef = useRef<SVGPathElement | null>(null);
  const mouthTongueRef = useRef<SVGPathElement | null>(null);
  const upperLipLineRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    let rafId = 0;
    let sJaw = 0;
    let sUpper = 0;
    let sWidth = 0;
    let sTongue = 0;
    let sTeeth = 0;
    let sSmile = 0;
    let sHeadTilt = 0;
    let sHeadBounce = 0;
    let wrapOpacity = 0;
    let lastActiveMs = 0;
    let breathWeight = 1;

    // Natural organic blink state machine (~2.8s–4.8s irregular blinks + occasional double blinks)
    let blinkActive = false;
    let blinkStartMs = 0;
    let nextBlinkMs = performance.now() + 1800;
    const BLINK_CLOSE_MS = 72;
    const BLINK_HOLD_MS = 28;
    const BLINK_OPEN_MS = 128;
    const BLINK_TOTAL_MS = BLINK_CLOSE_MS + BLINK_HOLD_MS + BLINK_OPEN_MS;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animateAvatar = (nowMs: number) => {
      const speech = audioEngine.getSpeechMouthState();
      const isActiveLine = speech.speaking && speech.phrase === HOME_WELCOME_PHRASE;
      if (isActiveLine) {
        lastActiveMs = nowMs;
      }

      // 1. Natural eyelid blinking (disabled only when reduced-motion is preferred)
      let blinkAmount = 0;
      if (!reduceMotion) {
        if (!blinkActive && nowMs >= nextBlinkMs) {
          blinkActive = true;
          blinkStartMs = nowMs;
        }
        if (blinkActive) {
          const elapsed = nowMs - blinkStartMs;
          if (elapsed >= BLINK_TOTAL_MS) {
            blinkActive = false;
            blinkAmount = 0;
            const isDoubleBlink = Math.random() < 0.2;
            nextBlinkMs =
              nowMs + (isDoubleBlink ? 165 : 2700 + Math.random() * 2300);
          } else if (elapsed < BLINK_CLOSE_MS) {
            const t = elapsed / BLINK_CLOSE_MS;
            blinkAmount = Math.sin(t * Math.PI * 0.5);
          } else if (elapsed < BLINK_CLOSE_MS + BLINK_HOLD_MS) {
            blinkAmount = 1;
          } else {
            const t = (elapsed - BLINK_CLOSE_MS - BLINK_HOLD_MS) / BLINK_OPEN_MS;
            blinkAmount = Math.cos(t * Math.PI * 0.5);
          }
        }
      }

      const eyesWrap = eyesWrapRef.current;
      if (eyesWrap) {
        if (blinkAmount <= 0.01) {
          eyesWrap.style.opacity = '0';
        } else {
          eyesWrap.style.opacity = '1';
          // Interpolate curved upper eyelid cleanly from open upper lash to warm closed crescent
          const b = Math.min(1, Math.max(0, blinkAmount));

          // Left eye inside glasses lens (880x1184 image space: x=464..532, y=330..369)
          const lY0 = 344 + b * 18.0;
          const lPeakY = 330 + b * 39.0;
          const lY1 = 342 + b * 16.0;
          const lLashD = `M 464 ${lY0.toFixed(2)} Q 496 ${lPeakY.toFixed(2)} 532 ${lY1.toFixed(2)}`;
          leftEyelashLineRef.current?.setAttribute('d', lLashD);
          leftEyelidCreaseRef.current?.setAttribute(
            'd',
            `M 468 ${(lY0 - 6.0).toFixed(2)} Q 496 ${(lPeakY - 7.0).toFixed(2)} 528 ${(lY1 - 5.5).toFixed(2)}`
          );
          leftEyelidFillRef.current?.setAttribute(
            'd',
            `M 460 318 L 540 318 L 540 ${lY1.toFixed(2)} Q 496 ${lPeakY.toFixed(2)} 464 ${lY0.toFixed(2)} Z`
          );

          // Right eye inside glasses lens (880x1184 image space: x=622..671, y=335..370)
          const rY0 = 346 + b * 14.0;
          const rPeakY = 335 + b * 35.0;
          const rY1 = 345 + b * 16.0;
          const rLashD = `M 622 ${rY0.toFixed(2)} Q 648 ${rPeakY.toFixed(2)} 671 ${rY1.toFixed(2)}`;
          rightEyelashLineRef.current?.setAttribute('d', rLashD);
          rightEyelidCreaseRef.current?.setAttribute(
            'd',
            `M 625 ${(rY0 - 5.5).toFixed(2)} Q 648 ${(rPeakY - 6.5).toFixed(2)} 668 ${(rY1 - 5.5).toFixed(2)}`
          );
          rightEyelidFillRef.current?.setAttribute(
            'd',
            `M 618 320 L 676 320 L 676 ${rY1.toFixed(2)} Q 648 ${rPeakY.toFixed(2)} 622 ${rY0.toFixed(2)} Z`
          );
        }
      }

      // 2. Expressive speech articulation + warm inviting smile curve
      const tJaw = isActiveLine ? speech.jawOpen : 0;
      const tUpper = isActiveLine ? speech.upperLift : 0;
      const tWidth = isActiveLine ? speech.lipWidth : 0;
      const tTongue = isActiveLine ? speech.tongueLift : 0;
      const tTeeth = isActiveLine ? speech.teethShow : 0;
      const tSmile = isActiveLine ? Math.min(1, 0.58 + speech.openness * 0.42) : 0;

      sJaw += (tJaw - sJaw) * (tJaw > sJaw ? 0.34 : 0.2);
      sUpper += (tUpper - sUpper) * (tUpper > sUpper ? 0.28 : 0.17);
      sWidth += (tWidth - sWidth) * 0.21;
      sTongue += (tTongue - sTongue) * 0.18;
      sTeeth += (tTeeth - sTeeth) * 0.24;
      sSmile += (tSmile - sSmile) * (tSmile > sSmile ? 0.14 : 0.09);

      if (!isActiveLine && sJaw < 0.008) sJaw = 0;
      if (!isActiveLine && sUpper < 0.008) sUpper = 0;
      if (!isActiveLine && Math.abs(sWidth) < 0.008) sWidth = 0;
      if (!isActiveLine && sTongue < 0.008) sTongue = 0;
      if (!isActiveLine && sTeeth < 0.008) sTeeth = 0;
      if (!isActiveLine && sSmile < 0.008) sSmile = 0;

      // 3. Coordinated posture: gentle idle breathing when silent, subtle expressive speech cadence when speaking
      const targetBreathWeight = reduceMotion ? 0 : isActiveLine ? 0.25 : 1;
      breathWeight += (targetBreathWeight - breathWeight) * 0.045;
      const targetTilt = !reduceMotion && isActiveLine ? Math.sin(nowMs * 0.0032) * 0.32 + sJaw * 0.28 : 0;
      const targetBounce = !reduceMotion && isActiveLine ? -(sJaw * 2.2 + Math.sin(nowMs * 0.005) * 0.8) : 0;
      sHeadTilt += (targetTilt - sHeadTilt) * 0.08;
      sHeadBounce += (targetBounce - sHeadBounce) * 0.12;

      const breathEl = avatarBreathRef.current;
      if (breathEl) {
        if (reduceMotion) {
          breathEl.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
        } else {
          const cyclePhase = (nowMs % 4400) / 4400;
          const rawWave = 0.5 - 0.5 * Math.cos(cyclePhase * Math.PI * 2);
          const breath = Math.pow(rawWave, 1.35) * breathWeight;
          const scaleY = 1 + breath * 0.011;
          const scaleX = 1 + breath * 0.0045;
          const liftY = -(breath * 2.2) + sHeadBounce;
          breathEl.style.transform = `translate3d(0, ${liftY.toFixed(2)}px, 0) rotate(${sHeadTilt.toFixed(3)}deg) scale(${scaleX.toFixed(5)}, ${scaleY.toFixed(5)})`;
        }
      }

      const recentlySpoke = isActiveLine || nowMs - lastActiveMs < 320 || sJaw > 0.012;
      const targetWrapOpacity = recentlySpoke ? 1 : 0;
      wrapOpacity +=
        (targetWrapOpacity - wrapOpacity) * (targetWrapOpacity > wrapOpacity ? 0.58 : 0.16);

      const wrap = mouthWrapRef.current;
      if (wrap) {
        if (wrapOpacity <= 0.01) {
          wrap.style.opacity = '0';
        } else {
          wrap.style.opacity = wrapOpacity.toFixed(3);

          // Calibrated 3/4-profile mouth keypoints for HD mascot_opening_pointing.png (880x1184)
          // Mapped into viewBox 0..208 x 0..156 covering (x:524..628, y:456..534)
          const smileWidth = sSmile * 5.2;
          const smileCornerLift = sSmile * 4.4;

          const wShift = sWidth * 9.5 + smileWidth;
          const cornerLift = sWidth * 2.6 + smileCornerLift;

          const xL = 34.0 - wShift;
          const yL = 72.0 - cornerLift;
          const xR = 164.0 + wShift * 0.72;
          const yR = 50.0 - cornerLift * 0.85;
          const cX = 104.0;
          const cTopX = 114.0;

          const upLiftPx = sUpper * 6.8 + sJaw * 3.4;
          const dropPx = sJaw * 37.0;

          const uPeakY = 60.0 - upLiftPx;
          const uTopPeakY = 40.0 - upLiftPx * 0.72;
          const uMidLX = (xL + cX) * 0.5;
          const uMidLY = (yL + uPeakY) * 0.5 + 1.4;
          const uMidRX = (cX + xR) * 0.5;
          const uMidRY = (uPeakY + yR) * 0.5 + 1.1;

          const lCenterY = 63.5 + dropPx;
          const lMidLX = (xL + cX) * 0.5;
          const lMidLY = yL * 0.22 + lCenterY * 0.78 + 2.2;
          const lMidRX = (cX + xR) * 0.5;
          const lMidRY = yR * 0.2 + lCenterY * 0.8 + 1.8;

          const upperInnerArc = `M ${xL.toFixed(2)} ${yL.toFixed(2)} Q ${uMidLX.toFixed(2)} ${uMidLY.toFixed(2)} ${cX} ${uPeakY.toFixed(2)} Q ${uMidRX.toFixed(2)} ${uMidRY.toFixed(2)} ${xR.toFixed(2)} ${yR.toFixed(2)}`;
          const lowerInnerArc = `Q ${lMidRX.toFixed(2)} ${lMidRY.toFixed(2)} ${cX} ${lCenterY.toFixed(2)} Q ${lMidLX.toFixed(2)} ${lMidLY.toFixed(2)} ${xL.toFixed(2)} ${yL.toFixed(2)}`;

          const cavityD = `${upperInnerArc} ${lowerInnerArc} Z`;
          mouthClipPathRef.current?.setAttribute('d', cavityD);
          mouthCavityRef.current?.setAttribute('d', cavityD);

          const upperLipD = `M ${xL.toFixed(2)} ${yL.toFixed(2)} Q ${(uMidLX - 2).toFixed(2)} ${(uMidLY - 11.5).toFixed(2)} ${cTopX} ${uTopPeakY.toFixed(2)} Q ${(uMidRX + 4).toFixed(2)} ${(uMidRY - 10.5).toFixed(2)} ${xR.toFixed(2)} ${yR.toFixed(2)} Q ${uMidRX.toFixed(2)} ${(uMidRY + 0.6).toFixed(2)} ${cX} ${(uPeakY + 0.6).toFixed(2)} Q ${uMidLX.toFixed(2)} ${(uMidLY + 0.6).toFixed(2)} ${xL.toFixed(2)} ${yL.toFixed(2)} Z`;
          upperLipFillRef.current?.setAttribute('d', upperLipD);

          const lOuterY = lCenterY + 26.0 - sJaw * 3.8;
          const lOuterLX = xL + 18;
          const lOuterLY = yL + 13.0 + dropPx * 0.44;
          const lOuterRX = xR - 15;
          const lOuterRY = yR + 13.0 + dropPx * 0.44;
          const lowerLipD = `M ${xL.toFixed(2)} ${yL.toFixed(2)} Q ${lMidLX.toFixed(2)} ${lMidLY.toFixed(2)} ${cX} ${lCenterY.toFixed(2)} Q ${lMidRX.toFixed(2)} ${lMidRY.toFixed(2)} ${xR.toFixed(2)} ${yR.toFixed(2)} Q ${lOuterRX.toFixed(2)} ${lOuterRY.toFixed(2)} ${cX} ${lOuterY.toFixed(2)} Q ${lOuterLX.toFixed(2)} ${lOuterLY.toFixed(2)} ${xL.toFixed(2)} ${yL.toFixed(2)} Z`;
          lowerLipFillRef.current?.setAttribute('d', lowerLipD);

          const sheenY = lCenterY + 11.0 - sJaw * 1.4;
          lowerLipSheenRef.current?.setAttribute(
            'd',
            `M 74 ${(sheenY + 3.0).toFixed(2)} Q 108 ${(sheenY + 4.0).toFixed(2)} 142 ${(sheenY - 2.5).toFixed(2)}`
          );

          const chinY = lOuterY + 6.0;
          chinShadowRef.current?.setAttribute(
            'd',
            `M 80 ${(chinY + 3.0).toFixed(2)} Q 108 ${(chinY + 4.2).toFixed(2)} 138 ${(chinY - 3.2).toFixed(2)}`
          );

          if (mouthTeethRef.current) {
            const aperture = Math.max(0, lCenterY - uPeakY);
            const teethHeight = Math.min(9.5, 2.8 + sJaw * 5.2 + sTeeth * 2.4);
            const tBotY = uPeakY + teethHeight;
            const teethD = `M ${(xL + 9).toFixed(2)} ${(yL - 6.5).toFixed(2)} L ${(xR - 8).toFixed(2)} ${(yR - 5.2).toFixed(2)} L ${(xR - 11).toFixed(2)} ${(uMidRY + teethHeight * 0.74).toFixed(2)} Q ${cX} ${tBotY.toFixed(2)} ${(xL + 12).toFixed(2)} ${(uMidLY + teethHeight * 0.74).toFixed(2)} Z`;
            mouthTeethRef.current.setAttribute('d', teethD);
            const tOp =
              aperture > 2.2 ? Math.min(0.96, (aperture - 2.2) * 0.19 + sTeeth * 0.36) : 0;
            mouthTeethRef.current.style.opacity = tOp.toFixed(3);
          }

          if (mouthTongueRef.current) {
            const aperture = Math.max(0, lCenterY - uPeakY);
            const tongueRaise = sTongue * Math.min(8.5, aperture * 0.44);
            const tonguePeakY = lCenterY - 4.8 - tongueRaise;
            const tongueBaseY = lCenterY + 11.0;
            const tongueD = `M ${(xL + 20).toFixed(2)} ${(lMidLY + 3.2).toFixed(2)} Q ${cX} ${tonguePeakY.toFixed(2)} ${(xR - 17).toFixed(2)} ${(lMidRY + 2.5).toFixed(2)} L ${(xR - 12).toFixed(2)} ${tongueBaseY.toFixed(2)} L ${(xL + 17).toFixed(2)} ${tongueBaseY.toFixed(2)} Z`;
            mouthTongueRef.current.setAttribute('d', tongueD);
            mouthTongueRef.current.style.opacity = aperture > 3.0 ? '0.96' : '0';
          }

          upperLipLineRef.current?.setAttribute('d', upperInnerArc);
        }
      }

      rafId = window.requestAnimationFrame(animateAvatar);
    };

    rafId = window.requestAnimationFrame(animateAvatar);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const handleStartClick = () => {
    audioEngine.unlockAndPreload();
    onStartSession();
  };

  return (
    <div className="relative w-full h-full bg-white overflow-hidden select-none">
      {/* Radial sky-blue halftone dot cloud behind left mascot */}
      <OpeningHalftoneBackdrop />

      {/* Top-right sound mute toggle */}
      <button
        type="button"
        onClick={() => audioEngine.toggleMute()}
        title={muted ? 'Unmute Kiosk Audio' : 'Mute Kiosk Audio'}
        aria-label={muted ? 'Unmute Kiosk Audio' : 'Mute Kiosk Audio'}
        className={`absolute top-6 right-8 z-30 w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer border shadow-xs ${
          muted
            ? 'bg-[#FFEAEA] border-[#F2B8B8] text-[#C8232C]'
            : 'bg-[#EAF6FF] border-[#BCE2FC] text-[#176BA8] hover:bg-[#D8EEFF]'
        }`}
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      {/* Top Centered Brand Logo + Tagline matching OPENING_PROMPT__1__f2fcca84.png */}
      <div className="absolute top-[52px] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
        <div className="scale-[0.71] origin-top -mb-[52px]">
          <FrameFitLogo size="lg" />
        </div>
        <p className="font-mono-ui text-[32px] font-bold text-black tracking-tight mt-2 text-center whitespace-nowrap">
          Wear what matches your glare.
        </p>
      </div>

      {/* Central Large Sky-Blue-Ringed START SESSION Button */}
      <div
        style={{ left: 700, top: 355 }}
        className="absolute z-10 flex flex-col items-center"
      >
        <button
          type="button"
          onClick={handleStartClick}
          className="group relative w-[520px] h-[520px] rounded-full bg-[#6BCEFF] shadow-[0_14px_34px_rgba(40,148,210,0.16)] cursor-pointer transition-transform duration-200 hover:scale-[1.02] active:scale-[0.985] focus-visible:outline-none"
        >
          {/* Inner white disc shifted slightly upward for crescent sky-blue rim */}
          <span className="absolute left-[16px] top-[5px] w-[488px] h-[488px] rounded-full bg-white flex items-center justify-center">
            <span className="font-mono-ui text-[32px] font-medium tracking-wide text-[#0B638D] group-hover:text-[#084D6E] transition-colors">
              START SESSION
            </span>
          </span>
        </button>

        <p className="mt-4 font-mono-ui text-[15px] text-[#5C6672] text-center tracking-tight">
          By tapping START SESSION, you agree to our privacy policy.
        </p>
      </div>

      {/* Left Pointing HD Mascot (880x1184) with Idle Breathing + Natural Eye Blinks + Expressive Lip-Sync */}
      <div
        ref={avatarBreathRef}
        style={{
          left: 0,
          top: 36,
          width: 776,
          height: 1044,
          transformOrigin: 'bottom center',
          willChange: 'transform',
        }}
        className="pointer-events-none absolute z-20 select-none"
      >
        <img
          src="/assets/extracted/mascot_opening_pointing.png"
          alt="Frame-Fit Optical Mascot"
          draggable={false}
          className="block w-full h-full object-contain object-bottom select-none"
        />

        {/* Calibrated Dual-Eyelid Natural Blink Overlay inside Glasses Lenses (x:455..685, y:316..386 in 880x1184) */}
        <svg
          ref={eyesWrapRef}
          viewBox="455 316 230 70"
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: '51.705%',
            top: '26.689%',
            width: '26.136%',
            height: '5.912%',
            opacity: 0,
          }}
        >
          <defs>
            <linearGradient id="ffBlinkLidLeftGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#F5CEC9" />
              <stop offset="58%" stopColor="#FCD0C8" />
              <stop offset="100%" stopColor="#EBB0A6" />
            </linearGradient>
            <linearGradient id="ffBlinkLidRightGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ECC1BC" />
              <stop offset="60%" stopColor="#F5C4BB" />
              <stop offset="100%" stopColor="#E0A198" />
            </linearGradient>
            <clipPath id="ffLeftEyeLensClip">
              <path d="M 463 340 C 468 326 488 323 512 324 C 528 325 538 332 538 345 C 538 362 522 375 496 375 C 474 375 462 362 463 340 Z" />
            </clipPath>
            <clipPath id="ffRightEyeLensClip">
              <path d="M 622 344 C 626 329 642 326 660 328 C 670 330 674 340 672 356 C 670 370 656 377 638 377 C 624 377 620 364 622 344 Z" />
            </clipPath>
          </defs>

          <g clipPath="url(#ffLeftEyeLensClip)">
            <path
              ref={leftEyelidFillRef}
              d="M 460 318 L 540 318 L 540 342 Q 496 330 464 344 Z"
              fill="url(#ffBlinkLidLeftGrad)"
            />
            <path
              ref={leftEyelidCreaseRef}
              d="M 468 338 Q 496 323 528 336.5"
              fill="none"
              stroke="rgba(176, 102, 95, 0.45)"
              strokeWidth="1.35"
              strokeLinecap="round"
            />
            <path
              ref={leftEyelashLineRef}
              d="M 464 344 Q 496 330 532 342"
              fill="none"
              stroke="#14161F"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </g>

          <g clipPath="url(#ffRightEyeLensClip)">
            <path
              ref={rightEyelidFillRef}
              d="M 618 320 L 676 320 L 676 345 Q 648 335 622 346 Z"
              fill="url(#ffBlinkLidRightGrad)"
            />
            <path
              ref={rightEyelidCreaseRef}
              d="M 625 340.5 Q 648 328.5 668 339.5"
              fill="none"
              stroke="rgba(172, 98, 92, 0.45)"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
            <path
              ref={rightEyelashLineRef}
              d="M 622 346 Q 648 335 671 345"
              fill="none"
              stroke="#14161F"
              strokeWidth="3.0"
              strokeLinecap="round"
            />
          </g>
        </svg>

        {/* Calibrated Crisp 3/4-Profile SVG Mouth Overlay (x:524..628, y:456..534 in 880x1184) */}
        <svg
          ref={mouthWrapRef}
          viewBox="0 0 208 156"
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: '59.545%',
            top: '38.514%',
            width: '11.818%',
            height: '6.588%',
            opacity: 0,
          }}
        >
          <defs>
            <linearGradient id="ffOpenSkinTone" x1="12%" y1="15%" x2="88%" y2="85%">
              <stop offset="0%" stopColor="#FEC3BB" />
              <stop offset="65%" stopColor="#FCC0B7" />
              <stop offset="100%" stopColor="#F5ADA2" />
            </linearGradient>
            <filter id="ffOpenSkinFeather" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.6" />
            </filter>
            <linearGradient id="ffOpenUpperLipGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(243, 133, 118, 0.85)" />
              <stop offset="55%" stopColor="#F5816F" />
              <stop offset="100%" stopColor="#CD5445" />
            </linearGradient>
            <linearGradient id="ffOpenLowerLipGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#F1907F" />
              <stop offset="48%" stopColor="#FE907F" />
              <stop offset="88%" stopColor="rgba(254, 144, 127, 0.45)" />
              <stop offset="100%" stopColor="rgba(254, 195, 187, 0)" />
            </linearGradient>
            <linearGradient id="ffOpenMouthInnerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#431016" />
              <stop offset="50%" stopColor="#82252B" />
              <stop offset="100%" stopColor="#AB4144" />
            </linearGradient>
            <linearGradient id="ffOpenTeethGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#E0C3BC" />
              <stop offset="45%" stopColor="#FFF9F7" />
              <stop offset="100%" stopColor="#F6EAE5" />
            </linearGradient>
            <linearGradient id="ffOpenTongueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#EB7E79" />
              <stop offset="100%" stopColor="#BA4C4C" />
            </linearGradient>
            <clipPath id="ffOpenMouthCavityClip">
              <path
                ref={mouthClipPathRef}
                d="M 34 72 Q 69 66 104 60 Q 134 55 164 50 Q 134 56.5 104 63.5 Q 69 67.5 34 72 Z"
              />
            </clipPath>
          </defs>

          {/* Clean feathered skin concealer matching the HD portrait cheek/chin */}
          <path
            d="M 16 68 Q 56 26 108 22 Q 162 18 188 54 Q 178 122 108 130 Q 34 126 16 68 Z"
            fill="url(#ffOpenSkinTone)"
            filter="url(#ffOpenSkinFeather)"
          />

          <path
            ref={lowerLipFillRef}
            d="M 34 72 Q 69 67.5 104 63.5 Q 134 56.5 164 50 Q 149 70 104 89.5 Q 54 84 34 72 Z"
            fill="url(#ffOpenLowerLipGrad)"
          />
          <path
            ref={lowerLipSheenRef}
            d="M 74 77.5 Q 108 78.5 142 72"
            fill="none"
            stroke="rgba(255, 240, 234, 0.55)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            ref={chinShadowRef}
            d="M 80 101 Q 108 102 138 94.5"
            fill="none"
            stroke="rgba(168, 102, 100, 0.28)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />

          <path
            ref={mouthCavityRef}
            d="M 34 72 Q 69 66 104 60 Q 134 55 164 50 Q 134 56.5 104 63.5 Q 69 67.5 34 72 Z"
            fill="url(#ffOpenMouthInnerGrad)"
          />

          <g clipPath="url(#ffOpenMouthCavityClip)">
            <path
              ref={mouthTeethRef}
              d="M 43 65.5 L 156 44.8 L 153 54 Q 104 62 46 69.5 Z"
              fill="url(#ffOpenTeethGrad)"
              style={{ opacity: 0 }}
            />
            <path
              ref={mouthTongueRef}
              d="M 54 71 Q 104 59 147 52.5 L 152 74 L 51 78 Z"
              fill="url(#ffOpenTongueGrad)"
              style={{ opacity: 0 }}
            />
          </g>

          <path
            ref={upperLipFillRef}
            d="M 34 72 Q 67 54.5 114 40 Q 140 44.5 164 50 Q 134 55 104 60 Q 69 66 34 72 Z"
            fill="url(#ffOpenUpperLipGrad)"
          />
          <path
            ref={upperLipLineRef}
            d="M 34 72 Q 69 66 104 60 Q 134 55 164 50"
            fill="none"
            stroke="#591C1B"
            strokeWidth="2.3"
            strokeLinecap="round"
            opacity="0.88"
          />
        </svg>
      </div>

      {/* Dedicated portrait hit zone on avatar (never covers the START SESSION circle) for 3-tap Admin trigger */}
      <button
        type="button"
        onClick={onAvatarTap}
        aria-label="Frame-Fit Optical Mascot"
        style={{ left: 16, top: 44, width: 620, height: 1036 }}
        className="absolute z-20 cursor-pointer bg-transparent focus-visible:outline-none"
      />

      {/* Hidden Admin Key Button: starts at avatar center -> slides right directly under START SESSION; returns leftward to avatar center */}
      {adminKeyState !== 'hidden' && (
        <button
          type="button"
          onClick={onOpenAdminLogin}
          aria-label="Open Administration Control Log-in"
          style={{
            left: 923,
            top: 936,
            animation:
              adminKeyState === 'visible'
                ? 'adminKeyReveal 0.82s cubic-bezier(0.22, 1, 0.36, 1) forwards'
                : 'adminKeyHide 0.44s ease-in forwards',
          }}
          className="absolute z-30 w-[74px] h-[74px] rounded-full bg-[#FFD600] hover:bg-[#F0C800] active:scale-95 shadow-[0_6px_14px_rgba(0,0,0,0.2)] flex items-center justify-center cursor-pointer"
        >
          <svg viewBox="0 0 48 48" className="w-10 h-10 fill-black" aria-hidden="true">
            <circle cx="34" cy="24" r="9.5" />
            <circle cx="34" cy="24" r="3.8" fill="#FFD600" />
            <rect x="7" y="21.5" width="20" height="5" rx="1.5" />
            <rect x="9" y="25" width="4.5" height="6.5" rx="1" />
            <rect x="16" y="25" width="4.5" height="5" rx="1" />
          </svg>
        </button>
      )}

      {/* Right Side "What is Frame-Fit?" Card matching OPENING_PROMPT__1__f2fcca84.png */}
      <aside
        style={{ left: 1333, top: 378, width: 426, height: 497 }}
        className="absolute z-10 rounded-[28px] bg-[#EDF0FA] px-[30px] pt-[22px] pb-[26px] flex flex-col gap-4"
      >
        <div className="w-full h-[69px] rounded-full bg-[#3BBEFF] flex items-center justify-center shadow-xs shrink-0">
          <h2 className="font-mono-ui text-[25px] font-bold text-black tracking-tight">
            What is Frame-Fit?
          </h2>
        </div>

        <div className="flex-1 rounded-[20px] bg-gradient-to-r from-white to-[#E4F6FF] p-5 flex flex-col justify-between">
          <div>
            <p className="font-mono-ui text-[16px] leading-[1.58] text-[#1E293B]">
              Frame-Fit is a smart eyewear kiosk that helps you discover frames tailored to your
              prescription, budget, and unique facial geometry.
            </p>

            <ol className="font-mono-ui text-[14.5px] text-[#334155] space-y-2.5 mt-4">
              <li className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#3BBEFF] text-black font-bold text-[13px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <span>Set your prescription &amp; frame budget</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#3BBEFF] text-black font-bold text-[13px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <span>Scan your face shape locally via camera</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#3BBEFF] text-black font-bold text-[13px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </span>
                <span>Try on &amp; compare matched frames</span>
              </li>
            </ol>
          </div>

          <div className="bg-white/90 border border-[#CBE0F4] rounded-xl px-3.5 py-2.5 font-mono-ui text-[12.5px] leading-snug text-[#1E4E6D]">
            Camera images are processed strictly locally and are never saved.
          </div>
        </div>
      </aside>

      {/* Bottom Right Eyewear Company Placeholder Note */}
      <div
        style={{ right: 92, bottom: 40 }}
        className="absolute z-10 text-right font-mono-ui text-[22px] leading-snug text-[#8A9098]"
      >
        (placeholder of eyewear company)
      </div>
    </div>
  );
};

interface PrivacyConsentProps {
  onAgree: () => void;
  onDecline: () => void;
}

export const KioskScreenPrivacyConsent: React.FC<PrivacyConsentProps> = ({
  onAgree,
  onDecline,
}) => {
  return (
    <div className="w-full h-full flex flex-col">
      <KioskHeader centerPillText="Data Privacy & Camera Consent" />

      <main className="kiosk-bg-gradient flex-1 flex items-center justify-center px-16 py-8 overflow-hidden">
        <div className="w-full max-w-[1160px] bg-white rounded-[36px] p-11 shadow-[0_14px_40px_rgba(24,92,138,0.12)] border border-[#D4EBF9] flex flex-col gap-7">
          <div className="flex items-start justify-between gap-6 border-b border-[#DCE7F2] pb-6">
            <div>
              <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#EAF6FF] border border-[#9AD8FF] font-mono-ui text-[14px] font-semibold text-[#176BA8] mb-3">
                Republic Act No. 10173 · Data Privacy Act of 2012
              </div>
              <h1 className="font-mono-ui text-[32px] font-bold text-[#1A5878] tracking-tight">
                Camera Access &amp; Privacy Consent
              </h1>
              <p className="font-mono-ui text-[18px] text-[#4C555E] mt-1.5">
                Before continuing, please review how Frame-Fit uses the kiosk camera for your
                eyewear fitting session.
              </p>
            </div>

            <div className="w-16 h-16 rounded-2xl bg-[#EAF6FF] border border-[#BCE2FC] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-[#176BA8]" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="bg-[#F6FAFE] border border-[#DCEBF7] rounded-2xl p-6 space-y-2">
              <div className="font-mono-ui text-[16px] font-bold text-[#176BA8]">
                1. Purpose of Camera Use
              </div>
              <p className="font-mono-ui text-[15px] leading-relaxed text-[#334155]">
                Your consent allows Frame-Fit to activate the kiosk camera solely to measure
                facial landmarks, classify your face shape, and preview frames on your face.
              </p>
            </div>

            <div className="bg-[#F6FAFE] border border-[#DCEBF7] rounded-2xl p-6 space-y-2">
              <div className="font-mono-ui text-[16px] font-bold text-[#176BA8]">
                2. Local Processing Only
              </div>
              <p className="font-mono-ui text-[15px] leading-relaxed text-[#334155]">
                Live camera feeds and your facial scan preview stay strictly inside this active
                local session and are never uploaded, sold, or saved to cloud storage.
              </p>
            </div>

            <div className="bg-[#F6FAFE] border border-[#DCEBF7] rounded-2xl p-6 space-y-2">
              <div className="font-mono-ui text-[16px] font-bold text-[#176BA8]">
                3. Voluntary Consent
              </div>
              <p className="font-mono-ui text-[15px] leading-relaxed text-[#334155]">
                Under the Data Privacy Act of 2012, camera participation is voluntary. Session
                images clear automatically when you end your session or tap Decline.
              </p>
            </div>
          </div>

          <div className="bg-[#EAF6FF] border border-[#9AD8FF] rounded-2xl px-6 py-4 font-mono-ui text-[17px] text-[#145075] font-medium text-center">
            By clicking <span className="font-bold">&ldquo;I Agree &amp; Consent to Camera Use&rdquo;</span>, you explicitly authorize Frame-Fit to use the camera during this session in accordance with the Data Privacy Act of 2012.
          </div>

          <div className="flex items-center justify-between pt-2">
            <ReturnButton
              label="Decline & Return"
              onClick={onDecline}
              className="px-10 whitespace-nowrap"
            />
            <ProceedButton
              label="I Agree & Consent to Camera Use"
              onClick={() => {
                audioEngine.unlockAndPreload();
                onAgree();
              }}
              className="px-10 whitespace-nowrap"
            />
          </div>
        </div>
      </main>
    </div>
  );
};

interface Screen2Props {
  prescription: CustomerPrescription;
  budgetPhp: number;
  matchingFramesUnderBudget: number;
  onChangePrescription: (next: CustomerPrescription) => void;
  onChangeBudgetPhp: (budget: number) => void;
  onReturn: () => void;
  onContinueToScan: () => void;
}

const SPH_OPTIONS = [
  '+4.00',
  '+3.50',
  '+3.00',
  '+2.50',
  '+2.00',
  '+1.50',
  '+1.00',
  '+0.50',
  '0.00',
  '-0.50',
  '-1.00',
  '-1.50',
  '-2.00',
  '-2.50',
  '-3.00',
  '-3.50',
  '-4.00',
  '-4.50',
  '-5.00',
  '-6.00',
  '-7.00',
  '-8.00',
];

const CYL_OPTIONS = [
  '0.00',
  '-0.25',
  '-0.50',
  '-0.75',
  '-1.00',
  '-1.25',
  '-1.50',
  '-1.75',
  '-2.00',
  '-2.50',
  '-3.00',
  '-3.50',
];

const BUDGET_PRESETS = [1500, 3000, 6000, 10000, 15000];

export const KioskScreen2RxBudget: React.FC<Screen2Props> = ({
  prescription,
  budgetPhp,
  matchingFramesUnderBudget,
  onChangePrescription,
  onChangeBudgetPhp,
  onReturn,
  onContinueToScan,
}) => {
  const skipPrescription = prescription.hasPrescription === false;
  const pdValue = parseFloat(prescription.pdMm || '62') || 62;

  const updateCyl = (side: 'left' | 'right', value: string) => {
    const nextLeftCyl = side === 'left' ? value : prescription.leftCyl;
    const nextRightCyl = side === 'right' ? value : prescription.rightCyl;
    const hasAstigmatism =
      (nextLeftCyl !== '0.00' && nextLeftCyl !== '') ||
      (nextRightCyl !== '0.00' && nextRightCyl !== '');
    onChangePrescription({
      ...prescription,
      hasPrescription: true,
      leftCyl: nextLeftCyl,
      rightCyl: nextRightCyl,
      astigmatism: hasAstigmatism,
    });
  };

  const updatePd = (nextPd: number) => {
    const clamped = Math.max(50, Math.min(78, Math.round(nextPd * 2) / 2));
    onChangePrescription({
      ...prescription,
      pdMm: clamped % 1 === 0 ? String(clamped) : clamped.toFixed(1),
    });
  };

  const budgetPercent = ((budgetPhp - 500) / (15000 - 500)) * 100;

  return (
    <div className="w-full h-full flex flex-col">
      <KioskHeader centerPillText="Prescription & Budget Setup" />

      <main className="kiosk-bg-gradient flex-1 flex flex-col justify-between px-16 py-7 overflow-hidden">
        <div className="w-full max-w-[1740px] mx-auto flex gap-10 flex-1 items-stretch">
          {/* Left Card: Prescription Inputs (SPH, CYL, AXIS, PD + Skip Checkbox) */}
          <section className="flex-1 bg-white rounded-[32px] p-9 shadow-[0_8px_24px_rgba(24,92,138,0.08)] flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 border-b border-[#DCE7F2] pb-5">
                <div>
                  <h2 className="font-mono-ui text-[28px] font-semibold text-[#1A5878]">
                    Optical Prescription
                  </h2>
                  <p className="font-mono-ui text-[16px] text-[#5B6570] mt-1">
                    Enter your eye grade values or skip if purchasing non-prescription frames.
                  </p>
                </div>

                <label
                  htmlFor="skip-rx-checkbox"
                  className={`inline-flex items-center gap-3.5 px-6 py-3 rounded-full border-2 font-mono-ui text-[18px] font-semibold cursor-pointer transition-colors shrink-0 ${
                    skipPrescription
                      ? 'bg-[#176BA8] border-[#176BA8] text-white shadow-sm'
                      : 'bg-[#F4FAFF] border-[#9AD8FF] text-[#1A5878] hover:bg-[#E7F4FF]'
                  }`}
                >
                  <input
                    id="skip-rx-checkbox"
                    type="checkbox"
                    checked={skipPrescription}
                    onChange={(e) =>
                      onChangePrescription({
                        ...prescription,
                        hasPrescription: e.target.checked ? false : true,
                      })
                    }
                    className="w-5 h-5 accent-white cursor-pointer"
                  />
                  <span className="whitespace-nowrap">Skip if no prescription</span>
                </label>
              </div>

              {/* Eye Prescription Grid */}
              <div
                className={`space-y-5 transition-opacity ${
                  skipPrescription ? 'opacity-45 pointer-events-none select-none' : 'opacity-100'
                }`}
              >
                {/* Header Row */}
                <div className="grid grid-cols-[150px_1fr_1fr_1fr] gap-5 px-2 font-mono-ui text-[15px] font-semibold uppercase tracking-wide text-[#5B6570]">
                  <div>Eye</div>
                  <div>SPH (Sphere)</div>
                  <div>CYL (Cylinder)</div>
                  <div>AXIS (1° - 180°)</div>
                </div>

                {/* Right Eye (OD) */}
                <div className="grid grid-cols-[150px_1fr_1fr_1fr] gap-5 items-center bg-[#F6FAFE] border border-[#DFECF7] rounded-2xl p-4">
                  <div className="font-mono-ui">
                    <div className="text-[19px] font-bold text-[#176BA8]">OD · Right</div>
                    <div className="text-[13px] text-[#5B6570]">Right Eye</div>
                  </div>

                  <div>
                    <label htmlFor="od-sph" className="sr-only">
                      Right Eye SPH
                    </label>
                    <select
                      id="od-sph"
                      disabled={skipPrescription}
                      value={prescription.rightGrade}
                      onChange={(e) =>
                        onChangePrescription({
                          ...prescription,
                          hasPrescription: true,
                          rightGrade: e.target.value,
                        })
                      }
                      className="w-full h-[52px] bg-white border border-[#C6D8E8] rounded-xl px-4 font-mono-ui text-[20px] text-black outline-none focus:ring-3 focus:ring-[#3BBEFF]"
                    >
                      {SPH_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt} D
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="od-cyl" className="sr-only">
                      Right Eye CYL
                    </label>
                    <select
                      id="od-cyl"
                      disabled={skipPrescription}
                      value={prescription.rightCyl}
                      onChange={(e) => updateCyl('right', e.target.value)}
                      className="w-full h-[52px] bg-white border border-[#C6D8E8] rounded-xl px-4 font-mono-ui text-[20px] text-black outline-none focus:ring-3 focus:ring-[#3BBEFF]"
                    >
                      {CYL_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt} D
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="od-axis" className="sr-only">
                      Right Eye AXIS
                    </label>
                    <input
                      id="od-axis"
                      type="number"
                      min={1}
                      max={180}
                      disabled={skipPrescription}
                      value={prescription.rightAxis}
                      onChange={(e) =>
                        onChangePrescription({
                          ...prescription,
                          hasPrescription: true,
                          rightAxis: e.target.value,
                        })
                      }
                      className="w-full h-[52px] bg-white border border-[#C6D8E8] rounded-xl px-4 font-mono-ui text-[20px] text-black tabular-nums outline-none focus:ring-3 focus:ring-[#3BBEFF]"
                    />
                  </div>
                </div>

                {/* Left Eye (OS) */}
                <div className="grid grid-cols-[150px_1fr_1fr_1fr] gap-5 items-center bg-[#F6FAFE] border border-[#DFECF7] rounded-2xl p-4">
                  <div className="font-mono-ui">
                    <div className="text-[19px] font-bold text-[#176BA8]">OS · Left</div>
                    <div className="text-[13px] text-[#5B6570]">Left Eye</div>
                  </div>

                  <div>
                    <label htmlFor="os-sph" className="sr-only">
                      Left Eye SPH
                    </label>
                    <select
                      id="os-sph"
                      disabled={skipPrescription}
                      value={prescription.leftGrade}
                      onChange={(e) =>
                        onChangePrescription({
                          ...prescription,
                          hasPrescription: true,
                          leftGrade: e.target.value,
                        })
                      }
                      className="w-full h-[52px] bg-white border border-[#C6D8E8] rounded-xl px-4 font-mono-ui text-[20px] text-black outline-none focus:ring-3 focus:ring-[#3BBEFF]"
                    >
                      {SPH_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt} D
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="os-cyl" className="sr-only">
                      Left Eye CYL
                    </label>
                    <select
                      id="os-cyl"
                      disabled={skipPrescription}
                      value={prescription.leftCyl}
                      onChange={(e) => updateCyl('left', e.target.value)}
                      className="w-full h-[52px] bg-white border border-[#C6D8E8] rounded-xl px-4 font-mono-ui text-[20px] text-black outline-none focus:ring-3 focus:ring-[#3BBEFF]"
                    >
                      {CYL_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt} D
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="os-axis" className="sr-only">
                      Left Eye AXIS
                    </label>
                    <input
                      id="os-axis"
                      type="number"
                      min={1}
                      max={180}
                      disabled={skipPrescription}
                      value={prescription.leftAxis}
                      onChange={(e) =>
                        onChangePrescription({
                          ...prescription,
                          hasPrescription: true,
                          leftAxis: e.target.value,
                        })
                      }
                      className="w-full h-[52px] bg-white border border-[#C6D8E8] rounded-xl px-4 font-mono-ui text-[20px] text-black tabular-nums outline-none focus:ring-3 focus:ring-[#3BBEFF]"
                    />
                  </div>
                </div>

                {/* Pupillary Distance (PD) */}
                <div className="flex items-center justify-between gap-6 bg-[#F6FAFE] border border-[#DFECF7] rounded-2xl px-5 py-4">
                  <div>
                    <label
                      htmlFor="rx-pd-input"
                      className="font-mono-ui text-[19px] font-semibold text-[#1A5878] block"
                    >
                      PD (Pupillary Distance)
                    </label>
                    <span className="font-mono-ui text-[14px] text-[#5B6570]">
                      Distance between pupil centers (typical adult range: 54–74 mm)
                    </span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      disabled={skipPrescription}
                      onClick={() => updatePd(pdValue - 0.5)}
                      className="w-11 h-11 rounded-xl bg-white border border-[#C6D8E8] hover:bg-[#EAF6FF] font-mono-ui text-[22px] font-bold text-[#176BA8] cursor-pointer"
                    >
                      -
                    </button>
                    <div className="flex items-center gap-2 bg-white border border-[#C6D8E8] rounded-xl px-4 h-12">
                      <input
                        id="rx-pd-input"
                        type="number"
                        step="0.5"
                        min={50}
                        max={78}
                        disabled={skipPrescription}
                        value={prescription.pdMm || '62'}
                        onChange={(e) =>
                          onChangePrescription({
                            ...prescription,
                            pdMm: e.target.value,
                          })
                        }
                        className="w-[74px] text-center font-mono-ui text-[21px] font-semibold text-black tabular-nums outline-none"
                      />
                      <span className="font-mono-ui text-[16px] text-[#5B6570]">mm</span>
                    </div>
                    <button
                      type="button"
                      disabled={skipPrescription}
                      onClick={() => updatePd(pdValue + 0.5)}
                      className="w-11 h-11 rounded-xl bg-white border border-[#C6D8E8] hover:bg-[#EAF6FF] font-mono-ui text-[22px] font-bold text-[#176BA8] cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {skipPrescription && (
              <div className="bg-[#EAF6FF] border border-[#9AD8FF] rounded-2xl px-6 py-4 font-mono-ui text-[18px] text-[#176BA8] font-medium">
                Non-prescription (Plano) selected — we will still scan your face shape and
                measure your PD automatically.
              </div>
            )}
          </section>

          {/* Right Card: Budget Slider (PHP 500 to PHP 15,000) */}
          <section className="w-[41%] bg-white rounded-[32px] p-9 shadow-[0_8px_24px_rgba(24,92,138,0.08)] flex flex-col justify-between">
            <div className="space-y-7">
              <div className="border-b border-[#DCE7F2] pb-5">
                <h2 className="font-mono-ui text-[28px] font-semibold text-[#1A5878]">
                  Frame Budget
                </h2>
                <p className="font-mono-ui text-[16px] text-[#5B6570] mt-1">
                  Set your preferred frame budget range from PHP 500 to PHP 15,000.
                </p>
              </div>

              <div className="bg-[#F4FAFF] border-2 border-[#BCE2FC] rounded-[26px] p-7 text-center space-y-2">
                <div className="font-mono-ui text-[15px] uppercase tracking-wider text-[#5B6570] font-semibold">
                  Maximum Frame Budget
                </div>
                <div className="font-mono-ui text-[48px] font-bold text-[#176BA8] tabular-nums leading-tight">
                  PHP {budgetPhp.toLocaleString('en-PH')}
                </div>
                <div className="font-mono-ui text-[16px] text-[#4C555E]">
                  {formatPeso(budgetPhp)} ·{' '}
                  <span className="font-semibold text-[#1A5878] tabular-nums">
                    {matchingFramesUnderBudget}
                  </span>{' '}
                  {matchingFramesUnderBudget === 1 ? 'frame' : 'frames'} within budget
                </div>
              </div>

              {/* Range Slider */}
              <div className="space-y-4 pt-2">
                <label htmlFor="budget-slider" className="sr-only">
                  Budget Slider (PHP 500 to PHP 15,000)
                </label>
                <input
                  id="budget-slider"
                  type="range"
                  min={500}
                  max={15000}
                  step={100}
                  value={budgetPhp}
                  onChange={(e) => onChangeBudgetPhp(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #176BA8 0%, #3BBEFF ${budgetPercent}%, #DCE7F2 ${budgetPercent}%, #DCE7F2 100%)`,
                  }}
                  className="w-full h-4 rounded-full appearance-none cursor-pointer accent-[#176BA8]"
                />
                <div className="flex items-center justify-between font-mono-ui text-[16px] font-semibold text-[#5B6570] tabular-nums">
                  <span>PHP 500</span>
                  <span>PHP 7,500</span>
                  <span>PHP 15,000</span>
                </div>
              </div>

              {/* Quick Budget Presets */}
              <div className="space-y-2.5 pt-2">
                <div className="font-mono-ui text-[15px] font-semibold text-[#5B6570]">
                  Quick Presets
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {BUDGET_PRESETS.map((preset) => {
                    const active = budgetPhp === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onChangeBudgetPhp(preset)}
                        className={`px-4 py-2 rounded-full font-mono-ui text-[16px] font-semibold tabular-nums cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#176BA8] text-white shadow-xs'
                            : 'bg-[#EEF5FC] hover:bg-[#DAEBFB] text-[#1A5878]'
                        }`}
                      >
                        ₱{preset.toLocaleString('en-PH')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-[#FFF9E6] border border-[#F5DC8A] rounded-2xl p-4 font-mono-ui text-[15px] text-[#6B5000] leading-snug">
              Next Step: Live camera facial scan will measure your eye distance and detect your
              face shape before unlocking your ranked shortlist.
            </div>
          </section>
        </div>
      </main>

      <footer className="kiosk-footer-bg h-[84px] shrink-0 px-16 flex items-center justify-between">
        <ReturnButton onClick={onReturn} className="w-[260px]" />
        <ProceedButton
          label="Continue to Face Scan"
          onClick={onContinueToScan}
          className="px-10 whitespace-nowrap"
        />
      </footer>
    </div>
  );
};
