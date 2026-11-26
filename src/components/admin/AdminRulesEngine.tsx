import React, { useState } from 'react';
import {
  ALL_FACE_SHAPES,
  ALL_FRAME_STYLES,
  DEFAULT_RULES_ENGINE,
} from '../../data/initialData';
import { FaceShape, FrameStyle, RulesEngineStore } from '../../types/framefit';
import { FaceShapeChip, ReturnButton } from '../shared/BrandLogo';

interface RulesEngineProps {
  rules: RulesEngineStore;
  onSaveRules: (next: RulesEngineStore) => void;
}

export const AdminRulesEngine: React.FC<RulesEngineProps> = ({ rules, onSaveRules }) => {
  const [draft, setDraft] = useState<RulesEngineStore>(rules);
  const [savedToast, setSavedToast] = useState(false);

  const toggleMatch = (shape: FaceShape, style: FrameStyle) => {
    setDraft((prev) => {
      const current = prev.faceShapeMatrix[shape] || [];
      const exists = current.includes(style);
      const nextList = exists ? current.filter((s) => s !== style) : [...current, style];
      return {
        ...prev,
        faceShapeMatrix: {
          ...prev.faceShapeMatrix,
          [shape]: nextList,
        },
      };
    });
  };

  const updateWeight = (
    key: 'faceShapeSuitability' | 'facialMeasurementFit' | 'budgetStockPriority',
    nextVal: number
  ) => {
    const clamped = Math.max(0, Math.min(100, nextVal));
    const remaining = 100 - clamped;
    const otherKeys = (
      ['faceShapeSuitability', 'facialMeasurementFit', 'budgetStockPriority'] as const
    ).filter((k) => k !== key);

    const k1 = otherKeys[0];
    const k2 = otherKeys[1];
    const sumOthers = draft.weights[k1] + draft.weights[k2];

    let val1: number;
    let val2: number;
    if (sumOthers === 0) {
      val1 = Math.floor(remaining / 2);
      val2 = remaining - val1;
    } else {
      val1 = Math.round((draft.weights[k1] / sumOthers) * remaining);
      val2 = remaining - val1;
    }

    setDraft((prev) => ({
      ...prev,
      weights: {
        ...prev.weights,
        [key]: clamped,
        [k1]: val1,
        [k2]: val2,
      },
    }));
  };

  const totalWeight =
    draft.weights.faceShapeSuitability +
    draft.weights.facialMeasurementFit +
    draft.weights.budgetStockPriority;

  const handleSave = () => {
    onSaveRules(draft);
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 2600);
  };

  const handleReset = () => {
    setDraft(DEFAULT_RULES_ENGINE);
    onSaveRules(DEFAULT_RULES_ENGINE);
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 2600);
  };

  return (
    <div className="flex flex-col gap-6 font-mono-ui">
      {/* 1. Face Shape Matrix (Data Store D3) */}
      <div className="bg-white rounded-[26px] p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[22px] font-semibold text-[#176BA8]">
            Face Shape Recommendation Matrix (Data Store D3)
          </h3>
          <span className="text-[13px] text-[#5B6570]">
            Tap cells to assign compatible frame styles per face shape
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#DCE5EE]">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-[#3BBEFF] text-white">
                <th className="py-3 px-4 text-left font-semibold min-w-[210px]">Face Shape</th>
                {ALL_FRAME_STYLES.map((style) => (
                  <th key={style} className="py-3 px-2.5 text-center font-semibold">
                    {style}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6ECF3]">
              {ALL_FACE_SHAPES.map((shape) => {
                const assigned = draft.faceShapeMatrix[shape] || [];
                return (
                  <tr key={shape} className="bg-white hover:bg-[#F5FAFF]">
                    <td className="py-2.5 px-3">
                      <FaceShapeChip shape={shape} size="sm" className="w-full" />
                    </td>
                    {ALL_FRAME_STYLES.map((style) => {
                      const active = assigned.includes(style);
                      return (
                        <td key={style} className="py-2 px-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleMatch(shape, style)}
                            aria-label={`${shape} matches ${style}`}
                            className={`w-10 h-10 rounded-xl font-bold text-[18px] transition-all cursor-pointer ${
                              active
                                ? 'bg-[#176BA8] text-white shadow-xs'
                                : 'bg-[#EEF3F8] text-[#9AA5B1] hover:bg-[#DCEAF7]'
                            }`}
                          >
                            {active ? '✓' : '·'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Weighting Sliders */}
      <div className="bg-white rounded-[26px] p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[22px] font-semibold text-[#176BA8]">Ranking Weighting Sliders</h3>
          <span className="bg-[#8FFF00] text-black px-5 py-1.5 rounded-full text-[15px] font-bold tabular-nums">
            Total Weight: {totalWeight}%
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#F5F9FD] rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-[15px]">Face Shape Suitability</span>
              <span className="text-[20px] font-bold text-[#176BA8] tabular-nums">
                {draft.weights.faceShapeSuitability}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={draft.weights.faceShapeSuitability}
              onChange={(e) => updateWeight('faceShapeSuitability', Number(e.target.value))}
              className="w-full accent-[#176BA8] cursor-pointer"
            />
          </div>

          <div className="bg-[#F5F9FD] rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-[15px]">Facial Measurement Fit</span>
              <span className="text-[20px] font-bold text-[#3BBEFF] tabular-nums">
                {draft.weights.facialMeasurementFit}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={draft.weights.facialMeasurementFit}
              onChange={(e) => updateWeight('facialMeasurementFit', Number(e.target.value))}
              className="w-full accent-[#3BBEFF] cursor-pointer"
            />
          </div>

          <div className="bg-[#F5F9FD] rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-[15px]">Budget / Stock Priority</span>
              <span className="text-[20px] font-bold text-[#1A5878] tabular-nums">
                {draft.weights.budgetStockPriority}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={draft.weights.budgetStockPriority}
              onChange={(e) => updateWeight('budgetStockPriority', Number(e.target.value))}
              className="w-full accent-[#1A5878] cursor-pointer"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4 pt-2">
          {savedToast && (
            <span className="bg-[#8FFF00] text-black px-5 py-2 rounded-full text-[14px] font-bold">
              ✓ Recommendation Rules Updated in D3
            </span>
          )}
          <ReturnButton label="Reset to Default" onClick={handleReset} className="px-8" />
          <button
            type="button"
            onClick={handleSave}
            className="bg-[#176BA8] hover:bg-[#135A8E] text-white px-9 py-3 rounded-full text-[18px] font-medium shadow cursor-pointer"
          >
            Save Rules
          </button>
        </div>
      </div>
    </div>
  );
};
