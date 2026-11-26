import React, { useState } from 'react';
import { CompatibilityRule, LensCatalogStore } from '../../types/framefit';
import { formatPhp } from '../../utils/recommendation';

interface LensCatalogProps {
  lensCatalog: LensCatalogStore;
  onSaveLensCatalog: (next: LensCatalogStore) => void;
}

export const AdminLensCatalog: React.FC<LensCatalogProps> = ({
  lensCatalog,
  onSaveLensCatalog,
}) => {
  const [draft, setDraft] = useState<LensCatalogStore>(lensCatalog);
  const [newCondition, setNewCondition] = useState('');
  const [newAction, setNewAction] = useState('');
  const [savedBanner, setSavedBanner] = useState(false);

  const toggleLensType = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      lensTypes: prev.lensTypes.map((lt) =>
        lt.id === id ? { ...lt, enabled: !lt.enabled } : lt
      ),
    }));
  };

  const updateLensPrice = (id: string, price: number) => {
    setDraft((prev) => ({
      ...prev,
      lensTypes: prev.lensTypes.map((lt) =>
        lt.id === id ? { ...lt, basePrice: Math.max(0, price) } : lt
      ),
    }));
  };

  const toggleCoatingDefault = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      coatings: prev.coatings.map((c) =>
        c.id === id ? { ...c, enabledByDefault: !c.enabledByDefault } : c
      ),
    }));
  };

  const updateCoatingPrice = (id: string, price: number) => {
    setDraft((prev) => ({
      ...prev,
      coatings: prev.coatings.map((c) =>
        c.id === id ? { ...c, addOnPrice: Math.max(0, price) } : c
      ),
    }));
  };

  const addRule = () => {
    if (!newCondition.trim() || !newAction.trim()) return;
    const rule: CompatibilityRule = {
      id: `rule-${Date.now()}`,
      condition: newCondition.trim(),
      action: newAction.trim(),
    };
    setDraft((prev) => ({
      ...prev,
      compatibilityRules: [...prev.compatibilityRules, rule],
    }));
    setNewCondition('');
    setNewAction('');
  };

  const removeRule = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      compatibilityRules: prev.compatibilityRules.filter((r) => r.id !== id),
    }));
  };

  const handleSaveAll = () => {
    onSaveLensCatalog(draft);
    setSavedBanner(true);
    window.setTimeout(() => setSavedBanner(false), 2600);
  };

  return (
    <div className="flex flex-col gap-6 font-mono-ui">
      {/* 1. Lens Types */}
      <div className="bg-white rounded-[26px] p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[22px] font-semibold text-[#176BA8]">
            Lens Types (Data Store D6)
          </h3>
          <span className="text-[13px] text-[#5B6570]">
            Controls options presented to customers on P18
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {draft.lensTypes.map((lt) => (
            <div
              key={lt.id}
              className={`rounded-2xl p-5 border-2 transition-colors ${
                lt.enabled ? 'border-[#3BBEFF] bg-[#F5FBFF]' : 'border-[#DCE5EE] bg-[#F8FAFC]'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[19px] font-bold text-black">{lt.name}</span>
                <button
                  type="button"
                  onClick={() => toggleLensType(lt.id)}
                  className={`px-4 py-1 rounded-full text-[13px] font-bold cursor-pointer ${
                    lt.enabled
                      ? 'bg-[#8FFF00] text-black'
                      : 'bg-[#C8D0D8] text-[#4B5563]'
                  }`}
                >
                  {lt.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <p className="text-[13px] text-[#5B6570] mb-4 min-h-[38px]">{lt.description}</p>
              <label className="block text-[13px] font-semibold text-[#1A5878] mb-1">
                Base Price (PHP)
              </label>
              <input
                type="number"
                value={lt.basePrice}
                onChange={(e) => updateLensPrice(lt.id, Number(e.target.value))}
                className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3 text-[16px] font-semibold tabular-nums"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 2. Coatings */}
      <div className="bg-white rounded-[26px] p-6 shadow-xs space-y-4">
        <h3 className="text-[22px] font-semibold text-[#176BA8]">Lens Coatings & Add-Ons</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {draft.coatings.map((coat) => (
            <div
              key={coat.id}
              className="rounded-2xl p-5 border border-[#DCE5EE] bg-[#F9FBFE] flex flex-col justify-between gap-3"
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={coat.enabledByDefault}
                  onChange={() => toggleCoatingDefault(coat.id)}
                  className="w-5 h-5 mt-1 accent-[#176BA8]"
                />
                <div>
                  <div className="text-[17px] font-bold text-black">{coat.name}</div>
                  <div className="text-[12px] text-[#5B6570] mt-0.5">{coat.description}</div>
                </div>
              </label>
              <div>
                <label className="block text-[13px] font-semibold text-[#1A5878] mb-1">
                  Add-on Price ({formatPhp(coat.addOnPrice)})
                </label>
                <input
                  type="number"
                  value={coat.addOnPrice}
                  onChange={(e) => updateCoatingPrice(coat.id, Number(e.target.value))}
                  className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3 text-[15px] font-semibold tabular-nums"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Prescription Compatibility Matrix */}
      <div className="bg-white rounded-[26px] p-6 shadow-xs space-y-4">
        <h3 className="text-[22px] font-semibold text-[#176BA8]">
          Prescription Compatibility Matrix
        </h3>

        <div className="overflow-hidden rounded-2xl border border-[#DCE5EE]">
          <table className="w-full text-left border-collapse text-[15px]">
            <thead>
              <tr className="bg-[#3BBEFF] text-white">
                <th className="py-3 px-4">Condition</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4 text-right">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6ECF3]">
              {draft.compatibilityRules.map((rule) => (
                <tr key={rule.id} className="bg-white">
                  <td className="py-3 px-4 font-semibold text-black">{rule.condition}</td>
                  <td className="py-3 px-4 text-[#176BA8]">{rule.action}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => removeRule(rule.id)}
                      className="bg-[#CF3434] hover:bg-[#B22626] text-white px-4 py-1 rounded-full text-[13px] cursor-pointer"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Rule Row */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <input
            type="text"
            value={newCondition}
            onChange={(e) => setNewCondition(e.target.value)}
            placeholder="Condition (e.g., If Age > 45)"
            className="flex-1 min-w-[220px] h-11 bg-[#F2F6FA] border border-[#CBD5E1] rounded-full px-5 text-[14px]"
          />
          <input
            type="text"
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            placeholder="Action (e.g., recommend Progressive lens)"
            className="flex-1 min-w-[240px] h-11 bg-[#F2F6FA] border border-[#CBD5E1] rounded-full px-5 text-[14px]"
          />
          <button
            type="button"
            onClick={addRule}
            className="bg-[#3BBEFF] hover:bg-[#2AAEEB] text-white px-6 py-2.5 rounded-full text-[15px] font-semibold cursor-pointer"
          >
            + Add Rule
          </button>
        </div>

        <div className="flex items-center justify-end gap-4 pt-2">
          {savedBanner && (
            <span className="bg-[#8FFF00] text-black px-5 py-2 rounded-full text-[14px] font-bold">
              ✓ Lens Catalog Saved to D6
            </span>
          )}
          <button
            type="button"
            onClick={handleSaveAll}
            className="bg-[#176BA8] hover:bg-[#135A8E] text-white px-9 py-3 rounded-full text-[18px] font-medium shadow cursor-pointer"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
