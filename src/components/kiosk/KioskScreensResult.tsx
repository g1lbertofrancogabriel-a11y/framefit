import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FACE_SHAPE_META } from '../../data/initialData';
import {
  CustomerPrescription,
  FacialScanResult,
  FrameItem,
  LensCatalogStore,
  RulesEngineStore,
} from '../../types/framefit';
import { audioEngine } from '../../utils/audioEngine';
import {
  LEFT_IRIS_CENTER,
  RIGHT_IRIS_CENTER,
} from '../../utils/faceAnalytics';
import {
  computeFrameSuitability,
  formatPeso,
  formatPrescriptionSummary,
  getEstimatedLensPrice,
  requiresHighIndexFromPrescription,
} from '../../utils/recommendation';
import {
  GeneratedReceiptPdf,
  generateReceiptPdf,
  triggerReceiptPdfDownload,
} from '../../utils/receiptPdf';
import {
  FaceShapeChip,
  FrameFitLogo,
  FrameVisual,
  KioskHeader,
  ProceedButton,
  ReturnButton,
} from '../shared/BrandLogo';

interface VirtualTryOnPreviewProps {
  scanResult: FacialScanResult;
  frame: FrameItem;
}

const VirtualTryOnPreview: React.FC<VirtualTryOnPreviewProps> = ({
  scanResult,
  frame,
}) => {
  const imgSrc = scanResult.sketchFaceDataUrl || scanResult.capturedPhotoDataUrl;
  const landmarks = scanResult.sketchLandmarks || scanResult.capturedLandmarks;
  const imgW = scanResult.sketchWidth || scanResult.capturedWidth || 460;
  const imgH = scanResult.sketchHeight || scanResult.capturedHeight || 560;

  let overlayStyle: React.CSSProperties = {
    left: '50%',
    top: '44%',
    width: '64%',
    transform: 'translate(-50%, -50%) rotate(0deg)',
  };

  if (landmarks && landmarks.length >= 468) {
    const leftIris = landmarks[LEFT_IRIS_CENTER] || landmarks[159] || landmarks[33];
    const rightIris = landmarks[RIGHT_IRIS_CENTER] || landmarks[386] || landmarks[263];
    const noseBridge = landmarks[6] || landmarks[168];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];

    const rawLX = leftIris.x * imgW;
    const rawLY = leftIris.y * imgH;
    const rawRX = rightIris.x * imgW;
    const rawRY = rightIris.y * imgH;

    // Strictly order pupils left-to-right in screen space to prevent any 180-deg flip
    const screenLeftEye = rawLX <= rawRX ? { x: rawLX, y: rawLY } : { x: rawRX, y: rawRY };
    const screenRightEye = rawLX <= rawRX ? { x: rawRX, y: rawRY } : { x: rawLX, y: rawLY };

    const centerXNorm = (leftIris.x + rightIris.x) / 2;
    const pupilMidY = (leftIris.y + rightIris.y) / 2;
    const centerYNorm = pupilMidY * 0.84 + (noseBridge?.y ?? pupilMidY) * 0.16;

    const eyeDx = Math.max(1, screenRightEye.x - screenLeftEye.x);
    const eyeDy = screenRightEye.y - screenLeftEye.y;
    const pdPx = Math.hypot(eyeDx, eyeDy);
    const cheekPx =
      leftCheek && rightCheek
        ? Math.hypot((rightCheek.x - leftCheek.x) * imgW, (rightCheek.y - leftCheek.y) * imgH)
        : pdPx * 2.15;

    const frameTotalMm = frame.lensWidthMm * 2 + frame.bridgeWidthMm + 16;
    const widthFromFaceMm =
      scanResult.faceWidthMm > 0 ? cheekPx * (frameTotalMm / scanResult.faceWidthMm) : cheekPx;
    const widthFromPdMm =
      scanResult.eyeDistanceMm > 0 ? pdPx * (frameTotalMm / scanResult.eyeDistanceMm) : pdPx * 2.18;

    const targetGlassesPx = Math.max(pdPx * 1.85, widthFromFaceMm * 0.45 + widthFromPdMm * 0.55);
    const widthPct = Math.max(28, Math.min(86, (targetGlassesPx / imgW) * 100));

    const rawTiltDeg = (Math.atan2(eyeDy, eyeDx) * 180) / Math.PI;
    const tiltDeg = Math.max(-28, Math.min(28, rawTiltDeg));

    overlayStyle = {
      left: `${centerXNorm * 100}%`,
      top: `${centerYNorm * 100}%`,
      width: `${widthPct}%`,
      transform: `translate(-50%, -50%) rotate(${tiltDeg.toFixed(2)}deg)`,
    };
  }

  return (
    <div className="relative w-full h-full rounded-[24px] bg-gradient-to-b from-[#E5F4FF] via-[#DCF0FE] to-[#CCE7FC] border border-[#BFE2FA] shadow-inner flex items-center justify-center overflow-hidden p-3">
      {imgSrc ? (
        <div
          className="relative h-full max-w-full flex items-center justify-center"
          style={{ aspectRatio: `${imgW} / ${imgH}` }}
        >
          <img
            src={imgSrc}
            alt="Scanned face virtual try-on preview"
            draggable={false}
            className="w-full h-full object-contain select-none contrast-[1.08] drop-shadow-[0_6px_14px_rgba(20,58,92,0.16)]"
          />

          <div
            style={overlayStyle}
            className="absolute pointer-events-none select-none flex items-center justify-center transition-all duration-200"
          >
            <FrameVisual
              imageUrl={frame.imageUrl}
              alt={frame.name}
              className="w-full h-auto object-contain drop-shadow-[0_6px_12px_rgba(12,34,58,0.42)]"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 text-center px-6">
          <FrameVisual imageUrl={frame.imageUrl} alt={frame.name} className="w-[240px] h-auto" />
          <span className="font-mono-ui text-[14px] text-[#5B6570]">
            Scanned face image unavailable — showing selected frame
          </span>
        </div>
      )}
    </div>
  );
};

interface Screen5Props {
  frames: FrameItem[];
  scanResult: FacialScanResult;
  rulesEngine: RulesEngineStore;
  lensCatalog: LensCatalogStore;
  prescription: CustomerPrescription;
  budgetPhp: number;
  activeFrameId: string;
  compareFrameIds: string[];
  favoriteFrameIds: string[];
  selectedColor: string;
  selectedLensTypeId: string;
  selectedCoatingIds: string[];
  onSelectActiveFrame: (frameId: string) => void;
  onAddCompareFrame: (frameId: string) => void;
  onRemoveCompareFrame: (frameId: string) => void;
  onToggleFavorite: (frameId: string) => void;
  onChangeColor: (color: string) => void;
  onChangeLensType: (id: string) => void;
  onToggleCoating: (id: string) => void;
  onBackToCatalog: () => void;
  onContinueToSummary: (lensPrice: number, totalCost: number) => void;
}

export const KioskScreen5TryOnCompare: React.FC<Screen5Props> = ({
  frames,
  scanResult,
  rulesEngine,
  lensCatalog,
  prescription,
  budgetPhp,
  activeFrameId,
  compareFrameIds,
  favoriteFrameIds,
  selectedColor,
  selectedLensTypeId,
  selectedCoatingIds,
  onSelectActiveFrame,
  onAddCompareFrame,
  onRemoveCompareFrame,
  onToggleFavorite,
  onChangeColor,
  onChangeLensType,
  onToggleCoating,
  onBackToCatalog,
  onContinueToSummary,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeFrame = useMemo(
    () => frames.find((f) => f.id === activeFrameId) || frames[0],
    [frames, activeFrameId]
  );

  const enabledLensTypes = useMemo(
    () => lensCatalog.lensTypes.filter((l) => l.enabled),
    [lensCatalog.lensTypes]
  );
  const activeLens =
    enabledLensTypes.find((l) => l.id === selectedLensTypeId) || enabledLensTypes[0];

  const lensPrice = useMemo(
    () =>
      getEstimatedLensPrice(
        lensCatalog,
        prescription,
        activeLens?.id || 'single-vision',
        selectedCoatingIds
      ),
    [lensCatalog, prescription, activeLens?.id, selectedCoatingIds]
  );

  const highIndexNeeded = requiresHighIndexFromPrescription(prescription);
  const totalCost = (activeFrame?.price || 0) + lensPrice;
  const isFavorited = activeFrame ? favoriteFrameIds.includes(activeFrame.id) : false;

  const activeSuitability = useMemo(
    () =>
      activeFrame
        ? computeFrameSuitability(activeFrame, scanResult, rulesEngine, budgetPhp)
        : { score: 85, eyeDistanceNote: '', nasalNote: '', otherFitNote: '' },
    [activeFrame, scanResult, rulesEngine, budgetPhp]
  );

  const comparedFrames = useMemo(() => {
    const ids = compareFrameIds.includes(activeFrameId)
      ? compareFrameIds
      : [activeFrameId, ...compareFrameIds].slice(0, 3);
    return ids
      .map((id) => frames.find((f) => f.id === id))
      .filter((f): f is FrameItem => Boolean(f))
      .slice(0, 3);
  }, [compareFrameIds, activeFrameId, frames]);

  // Available frames not yet in the 3-frame comparison tray, sorted by suitability score
  const availableToAddForCompare = useMemo(() => {
    const used = new Set(comparedFrames.map((f) => f.id));
    return frames
      .filter((f) => !used.has(f.id))
      .map((f) => ({
        frame: f,
        score: computeFrameSuitability(f, scanResult, rulesEngine, budgetPhp).score,
      }))
      .sort((a, b) => b.score - a.score);
  }, [frames, comparedFrames, scanResult, rulesEngine, budgetPhp]);

  if (!activeFrame) return null;

  return (
    <div className="relative w-full h-full flex flex-col">
      <KioskHeader centerPillText="Virtual Try-On & Comparison" />

      <main className="kiosk-bg-gradient flex-1 flex gap-8 px-14 py-6 overflow-hidden">
        {/* Left Column: Virtual Try-On Stage over Scanned Face + Add to Favorites */}
        <section className="w-[37%] bg-white rounded-[32px] p-6 shadow-[0_8px_24px_rgba(24,92,138,0.08)] flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="bg-[#3BBEFF] text-white px-5 py-1.5 rounded-full font-mono-ui text-[17px] font-semibold">
              Virtual Try-On
            </span>
            <span className="px-4 py-1 rounded-full bg-[#EAF6FF] border border-[#CBE2F7] font-mono-ui text-[13px] font-semibold text-[#176BA8]">
              Scanned Face Preview
            </span>
          </div>

          <div className="flex-1 min-h-0">
            <VirtualTryOnPreview scanResult={scanResult} frame={activeFrame} />
          </div>

          {/* Active Frame Title + Emphasized Suitability % + Color Swatches + Add to Favorites */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-mono-ui text-[25px] font-bold text-[#1A5878] truncate">
                  {activeFrame.name}
                </h2>
                <div className="font-mono-ui text-[16px] text-[#5B6570]">
                  {activeFrame.brand} · {activeFrame.style} · Shelf {activeFrame.shelfLocation}
                </div>
              </div>
              <div className="px-5 py-2 rounded-full bg-[#DCF7CE] border-2 border-[#7ED45F] text-[#16570A] font-mono-ui shadow-xs shrink-0 flex items-baseline gap-1.5">
                <span className="text-[24px] font-extrabold tabular-nums leading-none">
                  {activeSuitability.score}%
                </span>
                <span className="text-[14px] font-bold uppercase tracking-tight">Match</span>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {activeFrame.availableColors.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => onChangeColor(col)}
                  className={`px-4 py-1.5 rounded-full font-mono-ui text-[15px] font-medium cursor-pointer transition-colors ${
                    selectedColor === col
                      ? 'bg-[#176BA8] text-white'
                      : 'bg-[#EEF3F8] hover:bg-[#DCE9F5] text-[#1E293B]'
                  }`}
                >
                  {col}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onToggleFavorite(activeFrame.id)}
              className={`w-full h-[52px] rounded-full font-mono-ui text-[20px] font-semibold cursor-pointer transition-all flex items-center justify-center gap-2.5 border-2 ${
                isFavorited
                  ? 'bg-[#FFE8EC] border-[#C8232C] text-[#C8232C]'
                  : 'bg-[#F4FAFF] border-[#176BA8] text-[#176BA8] hover:bg-[#E4F2FE]'
              }`}
            >
              <span>{isFavorited ? '♥ Favorited' : '♡ Add to Favorites'}</span>
            </button>
          </div>
        </section>

        {/* Right Column: Side-by-Side Comparison (up to 3 frames) + Lens Configuration */}
        <section className="flex-1 flex flex-col gap-5 min-w-0">
          {/* Top Card: Side-by-Side Comparison (up to 3 frames) */}
          <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_24px_rgba(24,92,138,0.08)] flex flex-col gap-4 flex-1 min-h-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-mono-ui text-[26px] font-bold text-[#1A5878]">
                  Side-by-Side Comparison ({comparedFrames.length}/3 Frames)
                </h3>
                <p className="font-mono-ui text-[16px] text-[#5B6570]">
                  Compare Suitability %, Availability, Frame Price, and Lens Price.
                </p>
              </div>

              {comparedFrames.length < 3 && (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="px-6 py-2.5 rounded-full bg-[#3BBEFF] hover:bg-[#24B0F6] text-white font-mono-ui text-[17px] font-semibold cursor-pointer shadow-xs whitespace-nowrap"
                >
                  + Add Frame to Compare
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
              {[0, 1, 2].map((slotIdx) => {
                const slotFrame = comparedFrames[slotIdx];
                if (!slotFrame) {
                  return (
                    <button
                      key={`empty-${slotIdx}`}
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="rounded-[24px] border-2 border-dashed border-[#B7D8F2] bg-[#F7FBFF] hover:bg-[#EAF5FF] flex flex-col items-center justify-center gap-3 p-5 text-center cursor-pointer transition-colors"
                    >
                      <span className="w-12 h-12 rounded-full bg-[#DCEFFC] text-[#176BA8] font-mono-ui text-[28px] font-bold flex items-center justify-center">
                        +
                      </span>
                      <span className="font-mono-ui text-[18px] font-semibold text-[#1A5878]">
                        Compare Slot {slotIdx + 1}
                      </span>
                      <span className="font-mono-ui text-[15px] text-[#5B6570]">
                        Tap to add a frame
                      </span>
                    </button>
                  );
                }

                const isCurrent = slotFrame.id === activeFrame.id;
                const slotSuitability = computeFrameSuitability(
                  slotFrame,
                  scanResult,
                  rulesEngine,
                  budgetPhp
                );
                const slotTotal = slotFrame.price + lensPrice;
                const slotFav = favoriteFrameIds.includes(slotFrame.id);

                return (
                  <div
                    key={slotFrame.id}
                    onClick={() => onSelectActiveFrame(slotFrame.id)}
                    className={`rounded-[24px] p-4 flex flex-col justify-between cursor-pointer transition-all border-2 ${
                      isCurrent
                        ? 'border-[#176BA8] bg-[#F2F9FF] shadow-[0_6px_18px_rgba(23,107,168,0.16)]'
                        : 'border-[#DCE7F2] bg-white hover:border-[#3BBEFF]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-3.5 py-0.5 rounded-full font-mono-ui text-[14px] font-bold ${
                          isCurrent
                            ? 'bg-[#176BA8] text-white'
                            : 'bg-[#E5EEF6] text-[#1A5878]'
                        }`}
                      >
                        {isCurrent ? 'Trying On' : `Option ${slotIdx + 1}`}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {slotFav && (
                          <span className="text-[#C8232C] text-[16px]" title="Favorited">
                            ♥
                          </span>
                        )}
                        {comparedFrames.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveCompareFrame(slotFrame.id);
                            }}
                            aria-label={`Remove ${slotFrame.name} from comparison`}
                            className="w-7 h-7 rounded-full bg-[#FFE8E8] hover:bg-[#CF3434] text-[#CF3434] hover:text-white font-bold text-[14px] flex items-center justify-center cursor-pointer transition-colors"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="h-[64px] flex items-center justify-center px-2 my-0.5">
                      <FrameVisual
                        imageUrl={slotFrame.imageUrl}
                        alt={slotFrame.name}
                        className="max-h-[60px] max-w-full object-contain"
                      />
                    </div>

                    <div className="font-mono-ui text-[17.5px] font-bold text-[#1A5878] text-center line-clamp-2 min-h-[42px] leading-tight flex items-center justify-center">
                      {slotFrame.name}
                    </div>

                    {/* Emphasized Suitability Percentage Banner */}
                    <div className="rounded-2xl bg-[#E3FAD5] border-2 border-[#8AD86B] px-3.5 py-1.5 flex items-center justify-between gap-2 my-1">
                      <span className="font-mono-ui text-[15px] font-bold text-[#1B5C10]">
                        Suitability:
                      </span>
                      <span className="font-mono-ui text-[26px] leading-none font-extrabold text-[#145309] tabular-nums">
                        {slotSuitability.score}%
                      </span>
                    </div>

                    {/* Comparison details with enlarged typography */}
                    <div className="border-t border-[#DCE7F2] pt-2 space-y-1 font-mono-ui text-[15px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#5B6570]">Availability:</span>
                        <span
                          className={`font-bold whitespace-nowrap ${
                            slotFrame.stock > 0 ? 'text-[#186A14]' : 'text-[#C25400]'
                          }`}
                        >
                          {slotFrame.stock > 0 ? 'In Stock' : 'Made-to-Order (7 days)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#5B6570]">Frame Price:</span>
                        <span className="font-bold text-black tabular-nums">
                          {formatPeso(slotFrame.price)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#5B6570]">Lens Price:</span>
                        <span className="font-bold text-[#176BA8] tabular-nums">
                          {formatPeso(lensPrice)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-[#E6EFF7] pt-1 text-[16.5px]">
                        <span className="font-bold text-[#1A5878]">Est. Total:</span>
                        <span className="font-extrabold text-black tabular-nums">
                          {formatPeso(slotTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Card: Lens Configuration (updates Lens Price live across comparison & summary) */}
          <div className="bg-white rounded-[28px] px-7 py-5 shadow-[0_8px_24px_rgba(24,92,138,0.08)] space-y-3 shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="font-mono-ui text-[18px] font-semibold text-[#1A5878]">
                Lens Options{' '}
                {prescription.hasPrescription === false && (
                  <span className="text-[14px] font-normal text-[#5B6570]">
                    (Skipped Prescription — Non-Prescription Plano ₱0.00)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {highIndexNeeded && (
                  <span className="bg-[#FFF4CC] text-[#7A5400] px-3 py-1 rounded-full font-mono-ui text-[13px] font-semibold">
                    High-Index (+{formatPeso(lensCatalog.highIndexAddOnPrice)})
                  </span>
                )}
                <span className="font-mono-ui text-[19px] font-bold text-[#176BA8] tabular-nums">
                  Est. Total: {formatPeso(totalCost)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {enabledLensTypes.map((lt) => {
                const active = activeLens?.id === lt.id && prescription.hasPrescription !== false;
                const disabled = prescription.hasPrescription === false;
                return (
                  <button
                    key={lt.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChangeLensType(lt.id)}
                    className={`px-4 py-2.5 rounded-2xl border-2 text-left transition-all ${
                      disabled
                        ? 'opacity-45 cursor-not-allowed bg-slate-50 border-slate-200'
                        : active
                        ? 'border-[#176BA8] bg-[#EAF6FF] cursor-pointer'
                        : 'border-[#DCE5EE] bg-white hover:border-[#3BBEFF] cursor-pointer'
                    }`}
                  >
                    <div className="font-mono-ui text-[15px] font-semibold text-black">
                      {lt.name}
                    </div>
                    <div className="font-mono-ui text-[13.5px] text-[#176BA8] font-semibold tabular-nums">
                      +{formatPeso(lt.basePrice)}
                    </div>
                  </button>
                );
              })}
            </div>

            {prescription.hasPrescription !== false && (
              <div className="flex items-center gap-3 pt-1">
                <span className="font-mono-ui text-[14px] font-semibold text-[#5B6570] shrink-0">
                  Coatings:
                </span>
                <div className="flex flex-wrap gap-2.5">
                  {lensCatalog.coatings.map((coat) => {
                    const checked = selectedCoatingIds.includes(coat.id);
                    return (
                      <button
                        key={coat.id}
                        type="button"
                        onClick={() => onToggleCoating(coat.id)}
                        className={`px-3.5 py-1.5 rounded-full border font-mono-ui text-[13.5px] cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[#176BA8] border-[#176BA8] text-white'
                            : 'bg-[#F5F9FD] border-[#C9DCEC] text-[#1E293B] hover:bg-[#E7F3FC]'
                        }`}
                      >
                        {checked ? '✓ ' : '+ '}
                        {coat.name} (+{formatPeso(coat.addOnPrice)})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="kiosk-footer-bg h-[84px] shrink-0 px-14 flex items-center justify-between">
        <ReturnButton label="Back to Shortlist" onClick={onBackToCatalog} className="px-8" />
        <ProceedButton
          label="Continue to Summary"
          onClick={() => onContinueToSummary(lensPrice, totalCost)}
          className="px-10 whitespace-nowrap"
        />
      </footer>

      {/* Quick Add-to-Compare Modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#3C4B57]/72 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false);
          }}
        >
          <div className="w-[1260px] max-h-[820px] bg-white rounded-[32px] p-9 shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-[#DCE7F2] pb-4">
              <h3 className="font-mono-ui text-[26px] font-semibold text-[#1A5878]">
                Select a Frame to Compare ({comparedFrames.length}/3 Selected)
              </h3>
              <ReturnButton label="Close" onClick={() => setPickerOpen(false)} className="px-7" />
            </div>

            <div className="grid grid-cols-4 gap-5 overflow-y-auto framefit-scroll pr-2 py-1">
              {availableToAddForCompare.map(({ frame, score }) => (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => {
                    onAddCompareFrame(frame.id);
                    onSelectActiveFrame(frame.id);
                    setPickerOpen(false);
                  }}
                  className="bg-[#F7FBFF] hover:bg-[#EAF5FF] border-2 border-[#D2E6F7] hover:border-[#176BA8] rounded-[24px] p-4 flex flex-col items-center justify-between gap-2 text-center cursor-pointer transition-all"
                >
                  <span className="px-3 py-0.5 rounded-full bg-[#E2FAD0] text-[#1D6B0F] font-mono-ui text-[13px] font-bold tabular-nums">
                    {score}% Match
                  </span>
                  <div className="h-[88px] flex items-center justify-center">
                    <FrameVisual
                      imageUrl={frame.imageUrl}
                      alt={frame.name}
                      className="max-h-[76px] max-w-full object-contain"
                    />
                  </div>
                  <div className="font-mono-ui text-[15px] font-semibold text-[#1A5878] line-clamp-2 min-h-[42px]">
                    {frame.name}
                  </div>
                  <div className="font-mono-ui text-[17px] font-bold text-black tabular-nums">
                    {formatPeso(frame.price)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface Screen6Props {
  orderNumber: string;
  scanResult: FacialScanResult;
  frame: FrameItem;
  selectedColor: string;
  lensTypeName: string;
  prescription: CustomerPrescription;
  lensPrice: number;
  totalPrice: number;
  favoriteCount: number;
  onBackToTryOn: () => void;
  onEndSession: () => void;
}

export const KioskScreen6Summary: React.FC<Screen6Props> = ({
  orderNumber,
  scanResult,
  frame,
  selectedColor,
  lensTypeName,
  prescription,
  lensPrice,
  totalPrice,
  favoriteCount,
  onBackToTryOn,
  onEndSession,
}) => {
  const [generatedPdf, setGeneratedPdf] = useState<GeneratedReceiptPdf | null>(null);
  const [printPhase, setPrintPhase] = useState<'idle' | 'printing' | 'printed'>('idle');
  const blobUrlRef = useRef<string | null>(null);
  const printTimerRef = useRef<number | null>(null);
  const doneTimerRef = useRef<number | null>(null);
  const shapeMeta = FACE_SHAPE_META[scanResult.faceShape];

  const ensurePdf = useCallback(async (): Promise<GeneratedReceiptPdf> => {
    if (generatedPdf) return generatedPdf;
    const pdf = await generateReceiptPdf({
      orderNumber,
      faceShape: scanResult.faceShape,
      frame,
      selectedColor,
      lensTypeName,
      prescription,
      framePrice: frame.price,
      lensPrice,
      totalPrice,
    });
    if (blobUrlRef.current && blobUrlRef.current !== pdf.blobUrl) {
      URL.revokeObjectURL(blobUrlRef.current);
    }
    blobUrlRef.current = pdf.blobUrl;
    setGeneratedPdf(pdf);
    return pdf;
  }, [
    generatedPdf,
    orderNumber,
    scanResult.faceShape,
    frame,
    selectedColor,
    lensTypeName,
    prescription,
    lensPrice,
    totalPrice,
  ]);

  useEffect(() => {
    void ensurePdf().catch(() => {});
  }, [orderNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (printTimerRef.current) window.clearTimeout(printTimerRef.current);
      if (doneTimerRef.current) window.clearTimeout(doneTimerRef.current);
      if (blobUrlRef.current) {
        const url = blobUrlRef.current;
        blobUrlRef.current = null;
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    };
  }, []);

  const handleDownloadPdf = async () => {
    try {
      const pdf = await ensurePdf();
      triggerReceiptPdfDownload(pdf.blobUrl, pdf.filename);
    } catch {
      // ignore transient canvas export failure
    }
  };

  const handlePrintAndEndSession = async () => {
    if (printPhase !== 'idle') return;
    audioEngine.unlockAndPreload();
    setPrintPhase('printing');
    audioEngine.playPrinterSound();

    try {
      const pdf = await ensurePdf();
      triggerReceiptPdfDownload(pdf.blobUrl, pdf.filename);
    } catch {
      // keep receipt printing flow resilient
    }

    printTimerRef.current = window.setTimeout(() => {
      setPrintPhase('printed');
      audioEngine.playCompletionChime();
      void audioEngine.speak('Thank you for using Frame-Fit!');

      doneTimerRef.current = window.setTimeout(() => {
        onEndSession();
      }, 1750);
    }, 1480);
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      <KioskHeader centerPillText="Selection Summary & Receipt" />

      <main className="kiosk-bg-gradient flex-1 flex items-stretch justify-center px-16 py-6 overflow-hidden">
        <div className="w-full max-w-[1730px] flex gap-10 items-stretch">
          {/* Left Card: Final Chosen Frame over Scanned Face + Shelf Location + Associate Handoff */}
          <section className="w-[41%] bg-white rounded-[32px] p-7 shadow-[0_8px_24px_rgba(24,92,138,0.08)] flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between">
              <span className="bg-[#3BBEFF] text-white px-6 py-1.5 rounded-full font-mono-ui text-[19px] font-semibold">
                Final Chosen Frame
              </span>
              <span className="font-mono-ui text-[16px] font-bold text-[#176BA8]">
                Order #{orderNumber}
              </span>
            </div>

            <div className="flex-1 min-h-0">
              <VirtualTryOnPreview scanResult={scanResult} frame={frame} />
            </div>

            <div className="bg-[#F4FAFF] border border-[#CFE6FA] rounded-2xl p-4 space-y-2 font-mono-ui">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[21px] font-bold text-[#1A5878] truncate">{frame.name}</div>
                <span className="font-bold text-[15px] text-[#176BA8] shrink-0">
                  Shelf {frame.shelfLocation}
                </span>
              </div>
              <div className="text-[14.5px] text-[#4C555E]">
                {frame.brand} · Color:{' '}
                <span className="font-semibold text-black">{selectedColor}</span> · SKU: {frame.sku}
              </div>
              <div className="pt-1.5 border-t border-[#D8EAF8] flex items-center justify-between gap-2 text-[14.5px]">
                <span className="text-[#5B6570] font-semibold">Fulfillment Method:</span>
                <span
                  className={`font-bold px-3 py-0.5 rounded-full text-[13.5px] ${
                    frame.stock > 0
                      ? 'bg-[#E3F9DC] text-[#186A14]'
                      : 'bg-[#FFF0DB] text-[#B84E00]'
                  }`}
                >
                  {frame.stock > 0
                    ? 'Ready for Pickup'
                    : 'Made-to-Order (Supplier Order Required)'}
                </span>
              </div>
            </div>

            <div className="bg-[#FFF9E6] border-2 border-[#FFD600] rounded-2xl px-5 py-3.5 text-center">
              <p className="font-mono-ui text-[18px] font-bold text-black leading-snug">
                Show this summary to the Sales Associate for final fitting.
              </p>
            </div>
          </section>

          {/* Right Card: Classic Anonymous Receipt Card Preview (no customer name) */}
          <section className="flex-1 bg-white rounded-[32px] px-10 py-7 shadow-[0_8px_24px_rgba(24,92,138,0.08)] flex flex-col items-center justify-between gap-4">
            <div className="w-full max-w-[680px] flex-1 bg-[#F9FBFE] border-2 border-[#E2ECF5] rounded-[28px] px-9 py-6 flex flex-col justify-between shadow-inner">
              {/* Receipt Header */}
              <div className="flex flex-col items-center gap-2">
                <div className="scale-[0.82] origin-top -mb-2">
                  <FrameFitLogo size="xs" />
                </div>
                <div className="font-mono-ui text-[22px] font-bold text-[#176BA8] tracking-tight">
                  Order No. {orderNumber}
                </div>
                <div className="flex items-center gap-3">
                  <FaceShapeChip shape={scanResult.faceShape} size="sm" />
                  <span className="font-mono-ui text-[14px] text-[#5B6570]">
                    Favorites: {favoriteCount}
                  </span>
                </div>
              </div>

              {/* Receipt Model & Specs */}
              <div className="space-y-2.5 font-mono-ui border-t-2 border-b-2 border-[#B8C2CC] py-4 my-2">
                <div className="flex items-baseline justify-between gap-4 text-[18px]">
                  <span className="font-semibold text-[#5B6570] shrink-0">Model:</span>
                  <span className="font-bold text-black text-right">{frame.name}</span>
                </div>
                <div className="flex items-baseline justify-between gap-4 text-[17px]">
                  <span className="font-semibold text-[#5B6570] shrink-0">Color:</span>
                  <span className="text-black text-right">{selectedColor}</span>
                </div>
                <div className="flex items-baseline justify-between gap-4 text-[17px]">
                  <span className="font-semibold text-[#5B6570] shrink-0">Lens Type:</span>
                  <span className="text-black text-right">{lensTypeName}</span>
                </div>
                <div className="flex items-baseline justify-between gap-4 text-[16px]">
                  <span className="font-semibold text-[#5B6570] shrink-0">Lens Grade:</span>
                  <span className="text-black text-right">
                    {formatPrescriptionSummary(prescription)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4 text-[17px]">
                  <span className="font-semibold text-[#5B6570] shrink-0">Shelf Location:</span>
                  <span className="font-extrabold text-[#176BA8] text-right">
                    {frame.shelfLocation} ({frame.style} · {shapeMeta.label})
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4 text-[16px]">
                  <span className="font-semibold text-[#5B6570] shrink-0">Fulfillment:</span>
                  <span
                    className={`font-bold text-right ${
                      frame.stock > 0 ? 'text-[#186A14]' : 'text-[#B84E00]'
                    }`}
                  >
                    {frame.stock > 0
                      ? 'Ready for Pickup'
                      : 'Made-to-Order (Supplier Order Required)'}
                  </span>
                </div>
              </div>

              {/* Receipt Itemized Cost & Total */}
              <div className="space-y-2 font-mono-ui">
                <div className="flex items-center justify-between text-[17px]">
                  <span className="text-[#4C555E]">Frame ({frame.sku}):</span>
                  <span className="font-semibold text-black tabular-nums">
                    {formatPeso(frame.price)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[17px]">
                  <span className="text-[#4C555E]">Estimated Lenses:</span>
                  <span className="font-semibold text-black tabular-nums">
                    {formatPeso(lensPrice)}
                  </span>
                </div>
                <div className="pt-2 border-t border-[#D2DDE8] flex items-center justify-between">
                  <span className="text-[22px] font-bold text-[#1A5878]">
                    Estimated Total (Frame + Lenses)
                  </span>
                  <span className="text-[34px] font-extrabold text-[#176BA8] tabular-nums">
                    {formatPeso(totalPrice)}
                  </span>
                </div>
              </div>
            </div>

            <div className="w-full max-w-[680px] flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                className="px-6 py-2.5 rounded-full bg-[#EEF5FC] hover:bg-[#DAEBFB] border border-[#B8D7F2] text-[#176BA8] font-mono-ui text-[16px] font-semibold cursor-pointer transition-colors"
              >
                Save Receipt PDF
              </button>

              <span className="font-mono-ui text-[14.5px] text-[#5B6570]">
                Ending session automatically prints your receipt summary.
              </span>
            </div>
          </section>
        </div>
      </main>

      <footer className="kiosk-footer-bg h-[84px] shrink-0 px-16 flex items-center justify-between">
        <ReturnButton label="Back to Try-On" onClick={onBackToTryOn} className="px-8" />
        <button
          type="button"
          disabled={printPhase !== 'idle'}
          onClick={() => void handlePrintAndEndSession()}
          className="inline-flex items-center justify-center gap-3 min-h-[54px] px-12 py-2.5 rounded-full bg-[#176BA8] hover:bg-[#135A8E] active:scale-[0.98] disabled:opacity-60 text-white font-mono-ui text-[24px] font-semibold shadow-[0_6px_14px_rgba(12,62,102,0.28)] cursor-pointer transition-all whitespace-nowrap"
        >
          <span>{printPhase === 'idle' ? 'End Session' : 'Printing Summary...'}</span>
        </button>
      </footer>

      {/* Thermal Receipt Printing & Completion Overlay (classic tested End-Session print flow) */}
      {printPhase !== 'idle' && (
        <div
          style={{ animation: 'modalBackdropIn 0.22s ease-out' }}
          className="fixed inset-0 z-50 bg-[#24323F]/78 flex items-center justify-center"
        >
          <div
            style={{ animation: 'modalCardIn 0.26s ease-out' }}
            className="w-[620px] bg-white rounded-[36px] px-10 py-9 shadow-2xl flex flex-col items-center text-center gap-5"
          >
            {/* Printer slot + sliding paper graphic */}
            <div className="relative w-[300px] flex flex-col items-center">
              <div className="w-full h-[22px] rounded-full bg-[#1E293B] shadow-inner" />
              <div
                className={`w-[240px] bg-[#F9FBFE] border-2 border-[#C7DAEC] border-t-0 rounded-b-2xl px-5 py-4 shadow-md transition-all duration-700 ${
                  printPhase === 'printed' ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-90'
                }`}
              >
                <div className="font-brand text-[16px] font-extrabold text-[#3BBEFF]">
                  FRAME-FIT
                </div>
                <div className="font-mono-ui text-[13px] font-bold text-[#176BA8] mt-1">
                  Order No. {orderNumber}
                </div>
                <div className="font-mono-ui text-[12px] text-[#334155] truncate mt-1">
                  {frame.name}
                </div>
                <div className="font-mono-ui text-[12px] text-[#5B6570] mt-0.5">
                  Shelf {frame.shelfLocation}
                </div>
                <div className="border-t border-dashed border-[#94A3B8] my-2" />
                <div className="font-mono-ui text-[16px] font-extrabold text-black tabular-nums">
                  {formatPeso(totalPrice)}
                </div>
              </div>
            </div>

            {printPhase === 'printing' ? (
              <>
                <h2 className="font-mono-ui text-[28px] font-bold text-[#1A5878]">
                  Printing Receipt Summary...
                </h2>
                <p className="font-mono-ui text-[17px] text-[#5B6570]">
                  Preparing your printed summary copy with frame, lens, and shelf details.
                </p>
              </>
            ) : (
              <>
                <div className="px-5 py-1.5 rounded-full bg-[#E3F9DC] border border-[#8AD67B] font-mono-ui text-[16px] font-bold text-[#186A14]">
                  Receipt Printed! ✓
                </div>
                <h2 className="font-mono-ui text-[28px] font-bold text-[#1A5878]">
                  Thank you for using Frame-Fit!
                </h2>
                <p className="font-mono-ui text-[17px] text-[#334155]">
                  Please present your receipt summary to the Sales Associate at Shelf{' '}
                  <span className="font-bold text-[#176BA8]">{frame.shelfLocation}</span>.
                </p>
                <button
                  type="button"
                  onClick={onEndSession}
                  className="mt-1 px-9 py-2.5 rounded-full bg-[#176BA8] hover:bg-[#135A8E] text-white font-mono-ui text-[18px] font-semibold cursor-pointer"
                >
                  Return to Welcome Screen
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
