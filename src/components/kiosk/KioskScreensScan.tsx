import React, { useEffect, useRef, useState } from 'react';
import { CustomerPrescription, FacialScanResult } from '../../types/framefit';
import {
  drawGoldenRatioAndMeshOverlay,
  generateBackgroundFreeSketch,
  SketchFaceAsset,
} from '../../utils/faceAnalytics';
import { formatPrescriptionSummary } from '../../utils/recommendation';
import {
  FaceShapeChip,
  KioskHeader,
  ProceedButton,
  ReturnButton,
} from '../shared/BrandLogo';

export { FaceScan as KioskP11ToP15CameraScan } from './FaceScan';

interface P10Props {
  onReturn: () => void;
  onProceed: () => void;
}

export const KioskP10FaceIntro: React.FC<P10Props> = ({ onReturn, onProceed }) => {
  return (
    <div className="w-full h-full flex flex-col">
      <KioskHeader centerPillText="Face Measurement Interface" />

      <main className="kiosk-bg-gradient flex-1 flex flex-col items-center justify-between px-20 py-10">
        <div className="flex-1 flex flex-col items-center justify-center gap-7">
          {/* Purple scan preview graphic matching PDF page 10 */}
          <div className="w-[705px] h-[420px] bg-[#5B14E8] relative overflow-hidden flex flex-col items-center justify-between p-6 shadow-[0_10px_28px_rgba(32,12,102,0.2)]">
            <div className="w-full h-[54px] border-[4px] border-[#8FFF00]" />

            <div className="relative w-full flex-1 flex items-end justify-center">
              <div className="absolute left-2 bottom-4 w-[138px] h-[84px] border-[4px] border-[#8FFF00] flex flex-col justify-center gap-2 px-3">
                <div className="border-t-[4px] border-dotted border-[#D4FF9A]" />
                <div className="border-t-[4px] border-dotted border-[#D4FF9A] w-3/4" />
              </div>

              <svg viewBox="0 0 320 260" className="w-[330px] h-[270px]" aria-hidden="true">
                <defs>
                  <linearGradient id="bustGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="100%" stopColor="#C4C9D4" />
                  </linearGradient>
                </defs>
                <path
                  d="M25 260 C35 190 95 165 160 165 C225 165 285 190 295 260 Z"
                  fill="url(#bustGrad)"
                  stroke="#374151"
                  strokeWidth="1.5"
                />
                <ellipse
                  cx="160"
                  cy="96"
                  rx="62"
                  ry="86"
                  fill="url(#bustGrad)"
                  stroke="#8FFF00"
                  strokeWidth="4"
                />
                <rect
                  x="96"
                  y="78"
                  width="48"
                  height="32"
                  fill="none"
                  stroke="#8FFF00"
                  strokeWidth="4"
                />
                <rect
                  x="176"
                  y="78"
                  width="48"
                  height="32"
                  fill="none"
                  stroke="#8FFF00"
                  strokeWidth="4"
                />
                <line x1="224" y1="94" x2="318" y2="94" stroke="#8FFF00" strokeWidth="4" />
              </svg>

              <div className="absolute right-2 top-8 w-[160px] h-[94px] border-[4px] border-[#8FFF00] flex flex-col justify-center items-center gap-2.5 px-4">
                <div className="w-full border-t-[4px] border-dotted border-[#D4FF9A]" />
                <div className="w-2/3 border-t-[4px] border-dotted border-[#D4FF9A]" />
                <div className="w-1/3 border-t-[4px] border-dotted border-[#D4FF9A]" />
              </div>
            </div>
          </div>

          <div className="text-center space-y-2.5 max-w-[900px]">
            <p className="font-mono-ui text-[27px] leading-snug text-black">
              We&apos;d like to check your measurements
              <br />
              through a thorough facial scan.
            </p>
            <p className="font-mono-ui text-[16px] text-[#55616D]">
              Camera consent: Your live feed is used temporarily during your session to measure facial
              proportions and render your try-on preview, and is wiped when you exit.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-12">
          <ReturnButton onClick={onReturn} className="w-[330px]" />
          <ProceedButton onClick={onProceed} className="w-[330px]" />
        </div>
      </main>

      <footer className="kiosk-footer-bg h-[64px] shrink-0" />
    </div>
  );
};

interface P16Props {
  scanResult: FacialScanResult;
  prescription: CustomerPrescription;
  budgetPhp?: number;
  onSketchReady?: (asset: SketchFaceAsset) => void;
  onDone: () => void;
}

export const KioskP16Processing: React.FC<P16Props> = ({
  scanResult,
  prescription,
  budgetPhp,
  onSketchReady,
  onDone,
}) => {
  const [progress, setProgress] = useState(14);
  const sketchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const onSketchReadyRef = useRef(onSketchReady);
  onSketchReadyRef.current = onSketchReady;

  useEffect(() => {
    let cancelled = false;

    const paintCroppedScreenshotPreview = (
      img: HTMLImageElement,
      landmarks: FacialScanResult['capturedLandmarks']
    ) => {
      const canvas = sketchCanvasRef.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const targetW = canvas.width;
      const targetH = canvas.height;
      ctx.clearRect(0, 0, targetW, targetH);

      // Compute clean face/head crop box matching the scanned screenshot landmarks
      let rx0 = 0;
      let ry0 = 0;
      let rx1 = 1;
      let ry1 = 1;
      if (landmarks && landmarks.length >= 468) {
        let minX = 1;
        let minY = 1;
        let maxX = 0;
        let maxY = 0;
        for (const p of landmarks) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const spanX = Math.max(0.1, maxX - minX);
        const spanY = Math.max(0.1, maxY - minY);
        rx0 = Math.max(0, minX - spanX * 0.45);
        rx1 = Math.min(1, maxX + spanX * 0.45);
        ry0 = Math.max(0, minY - spanY * 0.52);
        ry1 = Math.min(1, maxY + spanY * 0.22);
      }

      const sx = rx0 * img.width;
      const sy = ry0 * img.height;
      const sw = Math.max(60, (rx1 - rx0) * img.width);
      const sh = Math.max(60, (ry1 - ry0) * img.height);

      const scale = Math.min(targetW / sw, targetH / sh);
      const drawW = sw * scale;
      const drawH = sh * scale;
      const offX = (targetW - drawW) / 2;
      const offY = (targetH - drawH) / 2;

      const rSpanX = Math.max(0.01, rx1 - rx0);
      const rSpanY = Math.max(0.01, ry1 - ry0);
      const mappedLandmarks = landmarks
        ? landmarks.map((p) => ({
            x: (p.x - rx0) / rSpanX,
            y: (p.y - ry0) / rSpanY,
            z: p.z,
          }))
        : undefined;

      // Render the user's scanned screenshot preview into a softly feathered portrait oval
      const portraitCanvas = document.createElement('canvas');
      portraitCanvas.width = targetW;
      portraitCanvas.height = targetH;
      const pCtx = portraitCanvas.getContext('2d');
      if (pCtx) {
        pCtx.save();
        pCtx.filter = 'contrast(104%) brightness(103%) saturate(88%)';
        pCtx.drawImage(img, sx, sy, sw, sh, offX, offY, drawW, drawH);
        pCtx.filter = 'none';

        // Soft radial vignette mask so the screenshot blends smoothly into the sky backdrop
        pCtx.globalCompositeOperation = 'destination-in';
        const cx = offX + drawW * 0.5;
        const cy = offY + drawH * 0.49;
        const rad = Math.max(drawW, drawH) * 0.52;
        const maskGrad = pCtx.createRadialGradient(cx, cy, rad * 0.55, cx, cy, rad);
        maskGrad.addColorStop(0, 'rgba(0,0,0,1)');
        maskGrad.addColorStop(0.76, 'rgba(0,0,0,0.92)');
        maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
        pCtx.fillStyle = maskGrad;
        pCtx.fillRect(0, 0, targetW, targetH);
        pCtx.restore();

        ctx.drawImage(portraitCanvas, 0, 0);
      }

      drawGoldenRatioAndMeshOverlay(ctx, mappedLandmarks, drawW, drawH, offX, offY);
    };

    const paintSketchAsset = (asset: SketchFaceAsset) => {
      const canvas = sketchCanvasRef.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const targetW = canvas.width;
        const targetH = canvas.height;
        ctx.clearRect(0, 0, targetW, targetH);

        const scale = Math.min(targetW / img.width, targetH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const offX = (targetW - drawW) / 2;
        const offY = (targetH - drawH) / 2;

        ctx.drawImage(img, offX, offY, drawW, drawH);
        drawGoldenRatioAndMeshOverlay(
          ctx,
          asset.sketchLandmarks,
          drawW,
          drawH,
          offX,
          offY
        );
      };
      img.src = asset.sketchFaceDataUrl;
    };

    if (scanResult.capturedPhotoDataUrl) {
      const photoImg = new Image();
      photoImg.onload = () => {
        if (!cancelled) {
          paintCroppedScreenshotPreview(photoImg, scanResult.capturedLandmarks);
        }
      };
      photoImg.src = scanResult.capturedPhotoDataUrl;

      if (!scanResult.sketchFaceDataUrl) {
        void generateBackgroundFreeSketch(scanResult).then((asset) => {
          if (!cancelled && asset) {
            onSketchReadyRef.current?.(asset);
          }
        });
      }
    } else if (scanResult.sketchFaceDataUrl && scanResult.sketchLandmarks) {
      paintSketchAsset({
        sketchFaceDataUrl: scanResult.sketchFaceDataUrl,
        sketchWidth: scanResult.sketchWidth || 500,
        sketchHeight: scanResult.sketchHeight || 620,
        sketchLandmarks: scanResult.sketchLandmarks,
      });
    } else {
      const canvas = sketchCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGoldenRatioAndMeshOverlay(
          ctx,
          scanResult.capturedLandmarks,
          canvas.width * 0.84,
          canvas.height * 0.84,
          canvas.width * 0.08,
          canvas.height * 0.08
        );
      }
    }

    return () => {
      cancelled = true;
    };
  }, [scanResult]);

  useEffect(() => {
    let cancelled = false;
    let doneTimer: number | undefined;
    const start = Date.now();
    const duration = 2600;
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.round(14 + (elapsed / duration) * 86));
      setProgress(pct);
      if (pct >= 100) {
        window.clearInterval(interval);
        doneTimer = window.setTimeout(() => {
          if (!cancelled) onDone();
        }, 280);
      }
    }, 45);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (doneTimer) window.clearTimeout(doneTimer);
    };
  }, [onDone]);

  const primaryMeasurements = [
    { label: 'Forehead Width', value: `${scanResult.foreheadWidthMm} mm` },
    { label: 'Cheekbone Width', value: `${scanResult.cheekboneWidthMm} mm` },
    { label: 'Jawline Length', value: `${scanResult.jawlineLengthMm} mm` },
    { label: 'Jawline Width', value: `${scanResult.jawlineWidthMm} mm` },
    { label: 'Face Length', value: `${scanResult.faceLengthMm} mm` },
  ];

  return (
    <div className="w-full h-full flex flex-col">
      <KioskHeader centerPillText="Choosing what’s the best for you..." />

      <main className="kiosk-bg-gradient flex-1 relative overflow-hidden flex items-center px-14 py-10">
        {/* Left Measurements Card matching design reference */}
        <div className="w-[465px] min-h-[620px] bg-white rounded-[34px] px-9 py-9 shadow-[0_8px_24px_rgba(24,92,138,0.08)] flex flex-col justify-between z-10">
          <div className="space-y-5">
            {primaryMeasurements.map((item) => (
              <div
                key={item.label}
                className="flex items-baseline justify-between gap-3 border-b-2 border-dashed border-[#9AA6B2] pb-2 font-mono-ui"
              >
                <span className="text-[21px] font-medium text-[#1E293B]">
                  {item.label}:
                </span>
                <span className="text-[22px] font-bold text-[#176BA8] tabular-nums">
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t-2 border-[#D4DCE4] pt-5 font-mono-ui text-[17px] leading-relaxed text-[#52606D] space-y-1.5 text-center">
            <div className="text-[#1E293B] font-semibold">
              Eye PD: {scanResult.eyeDistanceMm} mm · Bridge: {scanResult.nasalWidthMm} mm
            </div>
            <div>Profile: {scanResult.jawlineProfile}</div>
            <div className="text-[16px] text-[#1A5878]">
              Rx: {formatPrescriptionSummary(prescription)}
            </div>
            {typeof budgetPhp === 'number' && (
              <div className="text-[16px] font-semibold text-[#176BA8]">
                Budget: Up to ₱{budgetPhp.toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Center Face Shape & Progress */}
        <div className="flex-1 flex flex-col items-center justify-between h-[620px] pl-10 pr-[430px] z-10">
          <div className="w-full max-w-[780px] bg-white rounded-[34px] px-12 py-10 shadow-[0_8px_24px_rgba(24,92,138,0.08)] flex flex-col items-center gap-7">
            <div className="font-mono-ui text-[27px] text-black">Your Face Shape is:</div>
            <FaceShapeChip shape={scanResult.faceShape} size="lg" className="min-w-[460px]" />
          </div>

          <div className="w-full max-w-[780px] flex flex-col items-center gap-5 pb-4">
            <p className="font-mono-ui text-[24px] leading-relaxed text-[#1E293B] text-center">
              Ranking your eyewear matches based on
              <br />
              your 5 facial measurements...
            </p>
            <div className="w-full h-[20px] bg-[#BCC3CB] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#3BBEFF] rounded-full transition-all duration-75"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right Scanned User Screenshot Preview + Geometric Mesh Overlay */}
        <canvas
          ref={sketchCanvasRef}
          width={560}
          height={680}
          aria-label="Scanned Face Preview with Geometric Mesh"
          className="absolute right-0 top-1/2 -translate-y-1/2 h-[92%] w-auto pointer-events-none select-none"
        />
      </main>

      <footer className="kiosk-footer-bg h-[64px] shrink-0" />
    </div>
  );
};

