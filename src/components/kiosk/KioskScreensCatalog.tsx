import React, { useMemo, useState } from 'react';
import { ALL_FACE_SHAPES, FACE_SHAPE_META } from '../../data/initialData';
import {
  FaceShape,
  FacialScanResult,
  FrameItem,
  OrganizeFilter,
  RulesEngineStore,
} from '../../types/framefit';
import { computeFrameSuitability, formatPeso } from '../../utils/recommendation';
import {
  FaceShapeChip,
  FrameVisual,
  KioskHeader,
  ReturnButton,
} from '../shared/BrandLogo';

const ORGANIZE_OPTIONS: OrganizeFilter[] = [
  'Most Accurate to Face Shape',
  'Highest Price',
  'Least Price',
  'With Modifiable Lens',
  'Most Stocks Available',
];

interface Screen4CatalogProps {
  frames: FrameItem[];
  scanResult: FacialScanResult;
  rulesEngine: RulesEngineStore;
  budgetPhp: number;
  activeFaceShape: FaceShape | null;
  activeOrganize: OrganizeFilter | null;
  compareFrameIds: string[];
  favoriteFrameIds: string[];
  onApplyFilters: (faceShape: FaceShape | null, organize: OrganizeFilter | null) => void;
  onToggleCompare: (frameId: string) => void;
  onTryOnFrame: (frameId: string) => void;
  onReturnToScan: () => void;
}

export const KioskScreen4Shortlist: React.FC<Screen4CatalogProps> = ({
  frames,
  scanResult,
  rulesEngine,
  budgetPhp,
  activeFaceShape,
  activeOrganize,
  compareFrameIds,
  favoriteFrameIds,
  onApplyFilters,
  onToggleCompare,
  onTryOnFrame,
  onReturnToScan,
}) => {
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [draftFaceShape, setDraftFaceShape] = useState<FaceShape | null>(activeFaceShape);
  const [draftOrganize, setDraftOrganize] = useState<OrganizeFilter | null>(activeOrganize);
  const [includeAboveBudget, setIncludeAboveBudget] = useState(false);

  const openModal = () => {
    setDraftFaceShape(activeFaceShape);
    setDraftOrganize(activeOrganize);
    setFilterModalOpen(true);
  };

  const targetShapeForScoring = activeFaceShape || scanResult.faceShape;

  const { displayedFrames, usedBudgetFallback } = useMemo(() => {
    const scoredAll = frames.map((frame) => {
      const suitability = computeFrameSuitability(
        frame,
        scanResult,
        rulesEngine,
        budgetPhp,
        targetShapeForScoring
      );
      return { frame, score: suitability.score };
    });

    let filtered = includeAboveBudget
      ? [...scoredAll]
      : scoredAll.filter((entry) => entry.frame.price <= budgetPhp);

    let fallbackTriggered = false;
    if (!includeAboveBudget && filtered.length === 0) {
      // If budget is below cheapest frame (e.g. PHP 500 vs lowest PHP 595), show closest affordable options
      filtered = [...scoredAll].sort((a, b) => a.frame.price - b.frame.price).slice(0, 8);
      fallbackTriggered = true;
    }

    if (activeFaceShape) {
      const shapeMatches = filtered.filter((entry) =>
        entry.frame.suitableFaceShapes.includes(activeFaceShape)
      );
      // Keep strict shape match unless empty; if empty, keep scored list so user can still explore
      filtered = shapeMatches;
    }

    if (activeOrganize === 'With Modifiable Lens') {
      filtered = filtered.filter((entry) => entry.frame.modifiableLens);
    }

    if (activeOrganize === 'Highest Price') {
      filtered.sort((a, b) => b.frame.price - a.frame.price || b.score - a.score);
    } else if (activeOrganize === 'Least Price') {
      filtered.sort((a, b) => a.frame.price - b.frame.price || b.score - a.score);
    } else if (activeOrganize === 'Most Stocks Available') {
      filtered.sort((a, b) => b.frame.stock - a.frame.stock || b.score - a.score);
    } else {
      // 'Most Accurate to Face Shape' or default
      filtered.sort((a, b) => b.score - a.score || a.frame.price - b.frame.price);
    }

    return { displayedFrames: filtered, usedBudgetFallback: fallbackTriggered };
  }, [
    frames,
    scanResult,
    rulesEngine,
    budgetPhp,
    targetShapeForScoring,
    includeAboveBudget,
    activeFaceShape,
    activeOrganize,
  ]);

  const detectedMeta = FACE_SHAPE_META[scanResult.faceShape];

  return (
    <div className="relative w-full h-full flex flex-col">
      <KioskHeader
        centerPillText={`Recommended for ${scanResult.faceShape} under your Budget.`}
      />

      <main className="kiosk-bg-gradient flex-1 flex flex-col px-14 pt-5 pb-4 overflow-hidden">
        {/* Top Blue Glasses Catalog Bar with Left Sunglasses-Folder Badge & Right Select Filter Trigger */}
        <div className="relative flex items-center h-[84px] mb-3 shrink-0 pl-[95px]">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-[160px] h-[160px] rounded-full bg-[#3BBEFF] border-[14px] border-[#3BBEFF] shadow-[0_6px_18px_rgba(24,92,138,0.22)] flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
              <svg viewBox="0 0 120 100" className="w-[86px] h-[72px]" aria-hidden="true">
                <path
                  d="M12 20 C12 13 17 9 24 9 H48 L60 20 H100 C107 20 112 25 112 32 V78 C112 85 107 90 100 90 H24 C17 90 12 85 12 78 Z"
                  fill="#75CEFF"
                />
                <path
                  d="M28 42 C41 40 52 42 59 47 C62 49 64 49 67 47 C74 42 85 40 98 42 L95 56 C91 65 81 67 74 63 C67 60 65 52 63 50 C61 52 59 60 52 63 C45 67 35 65 31 56 Z"
                  fill="#0F172A"
                />
                <path
                  d="M24 43 L38 32 M102 43 L88 32"
                  stroke="#0F172A"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          <div className="w-full h-[70px] bg-[#3BBEFF] rounded-full flex items-center justify-between pl-24 pr-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span
                style={{ backgroundColor: detectedMeta.color, color: detectedMeta.textColor }}
                className="px-4 py-1.5 rounded-full font-mono-ui text-[15px] font-semibold shadow-xs whitespace-nowrap"
              >
                {scanResult.faceShape} Face Shape
              </span>
              <span className="bg-white/95 text-[#176BA8] px-4 py-1.5 rounded-full font-mono-ui text-[15px] font-bold tabular-nums shadow-xs whitespace-nowrap">
                Budget: {formatPeso(budgetPhp)}
              </span>
            </div>

            <h2 className="font-mono-ui text-[27px] font-medium text-white tracking-tight">
              Ranked Shortlist ({displayedFrames.length})
            </h2>

            <button
              type="button"
              onClick={openModal}
              aria-label="Open Select Filter"
              className="h-[50px] px-5 rounded-[14px] bg-white hover:bg-[#EAF7FF] active:scale-95 flex items-center gap-3 shadow cursor-pointer transition-transform"
            >
              <span className="flex flex-col gap-1">
                <span className="w-6 h-[3.5px] rounded-full bg-[#3BBEFF]" />
                <span className="w-6 h-[3.5px] rounded-full bg-[#3BBEFF]" />
                <span className="w-6 h-[3.5px] rounded-full bg-[#3BBEFF]" />
              </span>
              <span className="font-mono-ui text-[17px] font-semibold text-[#176BA8] whitespace-nowrap">
                Select Filter
              </span>
            </button>
          </div>
        </div>

        {/* Active Filter & Budget Status Strip */}
        <div className="flex items-center justify-between gap-4 pl-[175px] mb-3 shrink-0 min-h-[38px]">
          <div className="flex items-center flex-wrap gap-3">
            {activeFaceShape && (
              <FaceShapeChip
                shape={activeFaceShape}
                size="sm"
                removable
                onClick={() => onApplyFilters(null, activeOrganize)}
              />
            )}
            {activeOrganize && (
              <button
                type="button"
                onClick={() => onApplyFilters(activeFaceShape, null)}
                className="inline-flex items-center gap-2.5 bg-[#176BA8] text-white px-5 py-1.5 rounded-full font-mono-ui text-[15px] shadow cursor-pointer hover:bg-[#135A8E]"
              >
                <span>{activeOrganize}</span>
                <span className="font-bold">✕</span>
              </button>
            )}
            {usedBudgetFallback && (
              <span className="bg-[#FFF4CC] border border-[#F2CF66] text-[#7A5400] px-4 py-1.5 rounded-full font-mono-ui text-[14px] font-semibold">
                No frames strictly ≤ {formatPeso(budgetPhp)} — showing closest budget options
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIncludeAboveBudget((prev) => !prev)}
            className={`px-4 py-1.5 rounded-full font-mono-ui text-[14px] font-semibold border cursor-pointer transition-colors whitespace-nowrap ${
              includeAboveBudget
                ? 'bg-[#176BA8] text-white border-[#176BA8]'
                : 'bg-white text-[#1A5878] border-[#B6DAF2] hover:bg-[#EAF6FF]'
            }`}
          >
            {includeAboveBudget ? 'Showing All Prices ✓' : 'Include Above Budget'}
          </button>
        </div>

        {/* Ranked Catalog Grid */}
        <div className="flex-1 overflow-y-auto framefit-scroll pr-4 pb-3">
          {displayedFrames.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center bg-white/85 rounded-[32px] p-12 text-center gap-5">
              <p className="font-mono-ui text-[25px] text-[#1A5878]">
                No frames match {activeFaceShape ? `${activeFaceShape} face shape` : 'your filters'}{' '}
                within {formatPeso(budgetPhp)}.
              </p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    onApplyFilters(scanResult.faceShape, 'Most Accurate to Face Shape');
                    setIncludeAboveBudget(true);
                  }}
                  className="bg-[#176BA8] hover:bg-[#135A8E] text-white px-8 py-3 rounded-full font-mono-ui text-[19px] font-semibold cursor-pointer"
                >
                  Show All Frames Under Expanded Budget
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApplyFilters(null, 'Most Accurate to Face Shape');
                    setIncludeAboveBudget(true);
                  }}
                  className="bg-white border-2 border-[#176BA8] text-[#176BA8] px-7 py-3 rounded-full font-mono-ui text-[19px] font-semibold cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-6">
              {displayedFrames.map(({ frame, score }) => {
                const isMadeToOrder = frame.stock <= 0;
                const isCompared = compareFrameIds.includes(frame.id);
                const isFavorited = favoriteFrameIds.includes(frame.id);

                return (
                  <article
                    key={frame.id}
                    className="bg-white rounded-[28px] p-5 shadow-[0_6px_18px_rgba(24,92,138,0.09)] border border-[#E3EEF7] flex flex-col justify-between gap-3 transition-transform hover:-translate-y-0.5"
                  >
                    {/* Top Row: Suitability Badge & Compare/Fav Status */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-3.5 py-1 rounded-full font-mono-ui text-[14px] font-bold tabular-nums ${
                          score >= 90
                            ? 'bg-[#E2FAD0] text-[#1D6B0F]'
                            : score >= 80
                            ? 'bg-[#E6F4FF] text-[#176BA8]'
                            : 'bg-[#FFF5D6] text-[#805B00]'
                        }`}
                      >
                        {score}% Match
                      </span>

                      <button
                        type="button"
                        onClick={() => onToggleCompare(frame.id)}
                        className={`px-3 py-1 rounded-full font-mono-ui text-[13px] font-semibold cursor-pointer transition-colors ${
                          isCompared
                            ? 'bg-[#176BA8] text-white'
                            : 'bg-[#EEF4FA] hover:bg-[#DCEAF7] text-[#1A5878]'
                        }`}
                      >
                        {isCompared ? 'In Compare ✓' : '+ Compare'}
                      </button>
                    </div>

                    {/* Model Image */}
                    <div className="w-full h-[140px] flex items-center justify-center px-2 bg-[#F8FBFE] rounded-2xl">
                      <FrameVisual
                        imageUrl={frame.imageUrl}
                        alt={frame.name}
                        className="max-h-[118px] max-w-full object-contain"
                      />
                    </div>

                    {/* Model Name, Price, Stock Status */}
                    <div className="space-y-1.5 text-center">
                      <h3 className="font-mono-ui text-[18px] font-semibold leading-snug text-[#1A5878] line-clamp-2 min-h-[48px] flex items-center justify-center">
                        {frame.name}
                      </h3>
                      <div className="font-mono-ui text-[22px] font-bold text-black tabular-nums">
                        {formatPeso(frame.price)}
                      </div>
                      <div className="flex items-center justify-center flex-wrap gap-2 text-[13px] font-mono-ui pt-0.5">
                        {isMadeToOrder ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#FFF0DB] border border-[#F5A64B] text-[#B84E00] font-bold">
                            Made-to-Order (Est. 7 days)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#E3F9DC] border border-[#8AD67B] text-[#186A14] font-bold tabular-nums">
                            In Stock: {frame.stock}
                          </span>
                        )}
                        {isFavorited && (
                          <span className="text-[#C8232C] font-semibold">· ♥ Saved</span>
                        )}
                      </div>
                    </div>

                    {/* Primary Try On Action */}
                    <button
                      type="button"
                      onClick={() => onTryOnFrame(frame.id)}
                      className="w-full h-[48px] rounded-full bg-[#176BA8] hover:bg-[#135A8E] active:scale-[0.98] text-white font-mono-ui text-[18px] font-semibold shadow-[0_5px_12px_rgba(12,62,102,0.24)] cursor-pointer transition-all whitespace-nowrap"
                    >
                      Try On
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Bottom White Footer */}
      <footer className="kiosk-footer-bg h-[84px] shrink-0 px-14 flex items-center justify-between">
        <ReturnButton label="Re-scan Face" onClick={onReturnToScan} className="px-8" />

        <div className="flex items-center gap-5">
          {compareFrameIds.length > 0 && (
            <button
              type="button"
              onClick={() => onTryOnFrame(compareFrameIds[0])}
              className="h-[54px] px-8 rounded-full bg-[#3BBEFF] hover:bg-[#24B0F6] text-white font-mono-ui text-[20px] font-semibold shadow-sm cursor-pointer transition-colors whitespace-nowrap"
            >
              Open Virtual Try-On ({compareFrameIds.length}/3 in Compare)
            </button>
          )}
        </div>
      </footer>

      {/* Visual Select Filter Overlay Modal matching PDF Pages 3 & 15 */}
      {filterModalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#3C4B57]/72"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFilterModalOpen(false);
          }}
        >
          <div className="w-[1520px] bg-white rounded-[36px] px-12 py-9 shadow-2xl flex flex-col gap-7">
            <div className="w-full bg-[#3BBEFF] text-white py-3 rounded-full flex items-center justify-center gap-4 font-mono-ui text-[30px] font-medium">
              <span className="flex flex-col gap-1.5">
                <span className="w-7 h-[3.5px] bg-white rounded-full" />
                <span className="w-7 h-[3.5px] bg-white rounded-full" />
                <span className="w-7 h-[3.5px] bg-white rounded-full" />
              </span>
              <span>Select Filter</span>
            </div>

            <div className="grid grid-cols-2 gap-12 pt-1">
              {/* Left: Face Shape (pre-selected to detected face shape) */}
              <div>
                <h3 className="font-mono-ui text-[26px] font-medium text-black pb-3 border-b-2 border-[#4B5563] mb-6">
                  Face Shape
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {ALL_FACE_SHAPES.map((shape) => (
                    <FaceShapeChip
                      key={shape}
                      shape={shape}
                      size="md"
                      active={draftFaceShape === shape}
                      onClick={() =>
                        setDraftFaceShape((prev) => (prev === shape ? null : shape))
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Right: Organize pills matching PDF / Screen 4 specification */}
              <div>
                <h3 className="font-mono-ui text-[26px] font-medium text-black pb-3 border-b-2 border-[#4B5563] mb-6">
                  Organize
                </h3>
                <div className="grid grid-cols-1 gap-3.5">
                  {ORGANIZE_OPTIONS.map((opt) => {
                    const active = draftOrganize === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          setDraftOrganize((prev) => (prev === opt ? null : opt))
                        }
                        className={`px-6 py-3 rounded-full font-mono-ui text-[20px] text-center shadow-[0_4px_10px_rgba(0,0,0,0.12)] cursor-pointer transition-all ${
                          active
                            ? 'bg-[#176BA8] text-white ring-3 ring-[#3BBEFF] font-semibold'
                            : 'bg-[#CAE9FF] hover:bg-[#B2DFFF] text-black'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-10 pt-4">
              <button
                type="button"
                onClick={() => {
                  onApplyFilters(draftFaceShape, draftOrganize);
                  setFilterModalOpen(false);
                }}
                className="inline-flex items-center justify-center gap-4 min-h-[54px] w-[360px] bg-white hover:bg-[#F2F8FD] text-black rounded-full font-mono-ui text-[23px] shadow-[0_6px_16px_rgba(0,0,0,0.18)] border border-[#E2E8F0] cursor-pointer active:scale-[0.98]"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-7 h-7 fill-none stroke-black stroke-2"
                  aria-hidden="true"
                >
                  <polygon points="3,4 21,4 14,13 14,20 10,18 10,13" />
                </svg>
                <span>Apply Filter</span>
              </button>

              <ReturnButton onClick={() => setFilterModalOpen(false)} className="w-[360px]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
