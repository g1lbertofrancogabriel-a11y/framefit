import React, { useMemo, useState } from 'react';
import { ALL_FACE_SHAPES, ALL_FRAME_STYLES } from '../../data/initialData';
import { FaceShape, FrameItem, FrameStyle } from '../../types/framefit';
import { formatPhp } from '../../utils/recommendation';
import { FrameVisual, ReturnButton } from '../shared/BrandLogo';

interface FrameCatalogProps {
  frames: FrameItem[];
  highlightedFrameId: string | null;
  onClearHighlight: () => void;
  onAddFrame: (frame: FrameItem) => void;
  onUpdateFrame: (frame: FrameItem) => void;
  onDeleteFrame: (frameId: string) => void;
}

type SortKey = 'sku' | 'name' | 'brand' | 'price' | 'stock' | 'shelfLocation';

export const AdminFrameCatalog: React.FC<FrameCatalogProps> = ({
  frames,
  highlightedFrameId,
  onClearHighlight,
  onAddFrame,
  onUpdateFrame,
  onDeleteFrame,
}) => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [modalFrame, setModalFrame] = useState<FrameItem | null>(null);
  const [isNewMode, setIsNewMode] = useState(false);
  const [deleteConfirmFrame, setDeleteConfirmFrame] = useState<FrameItem | null>(null);

  // Form states inside modal
  const [sku, setSku] = useState('');
  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [material, setMaterial] = useState('');
  const [lensWidthMm, setLensWidthMm] = useState(50);
  const [bridgeWidthMm, setBridgeWidthMm] = useState(19);
  const [templeLengthMm, setTempleLengthMm] = useState(145);
  const [price, setPrice] = useState(1995);
  const [stock, setStock] = useState(5);
  const [shelfLocation, setShelfLocation] = useState('Rack A-1');
  const [style, setStyle] = useState<FrameStyle>('Rectangular');
  const [genderTarget, setGenderTarget] = useState<'Unisex' | 'Male-Centric' | 'Female-Centric'>('Unisex');
  const [modifiableLens, setModifiableLens] = useState(true);
  const [suitableFaceShapes, setSuitableFaceShapes] = useState<FaceShape[]>(['Oval', 'Round']);
  const [imageUrl, setImageUrl] = useState('/assets/frames/frm-01.png');
  const [glbFileName, setGlbFileName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const openNewModal = () => {
    setIsNewMode(true);
    setModalFrame(null);
    setSku(`FF-NEW-${frames.length + 101}`);
    setBrand('');
    setName('');
    setColor('Matte Black');
    setMaterial('Acetate');
    setLensWidthMm(51);
    setBridgeWidthMm(19);
    setTempleLengthMm(145);
    setPrice(1995);
    setStock(6);
    setShelfLocation('Rack A-3');
    setStyle('Rectangular');
    setGenderTarget('Unisex');
    setModifiableLens(true);
    setSuitableFaceShapes(['Oval', 'Round']);
    setImageUrl('/assets/frames/frm-12.png');
    setGlbFileName('');
    setUploadProgress(0);
    setUploadError(null);
  };

  const openEditModal = (f: FrameItem) => {
    setIsNewMode(false);
    setModalFrame(f);
    setSku(f.sku);
    setBrand(f.brand);
    setName(f.name);
    setColor(f.color);
    setMaterial(f.material);
    setLensWidthMm(f.lensWidthMm);
    setBridgeWidthMm(f.bridgeWidthMm);
    setTempleLengthMm(f.templeLengthMm);
    setPrice(f.price);
    setStock(f.stock);
    setShelfLocation(f.shelfLocation);
    setStyle(f.style);
    setGenderTarget(f.genderTarget);
    setModifiableLens(f.modifiableLens);
    setSuitableFaceShapes(f.suitableFaceShapes);
    setImageUrl(f.imageUrl);
    setGlbFileName(f.glbFileName || '');
    setUploadProgress(f.glbFileName ? 100 : 0);
  };

  const closeModal = () => {
    setModalFrame(null);
    setIsNewMode(false);
    setUploadError(null);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = frames.filter(
      (f) =>
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.brand.toLowerCase().includes(q) ||
        f.sku.toLowerCase().includes(q) ||
        f.shelfLocation.toLowerCase().includes(q)
    );
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortAsc ? av - bv : bv - av;
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return list;
  }, [frames, search, sortKey, sortAsc]);

  const handleAssetDropOrSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);

    Array.from(files).forEach((file) => {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.glb') || lowerName.endsWith('.gltf')) {
        setGlbFileName(file.name);
        setUploadProgress(25);
        window.setTimeout(() => setUploadProgress(65), 180);
        window.setTimeout(() => setUploadProgress(100), 420);
      } else if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(lowerName)) {
        // Must be a .png file with genuine transparent background (alpha < 255 pixels)
        const isPng = file.type === 'image/png' || lowerName.endsWith('.png');
        if (!isPng) {
          setUploadError(
            `Rejected "${file.name}": Frame thumbnail must be a .png file with a transparent background.`
          );
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== 'string') return;
          const dataUrl = reader.result;
          const img = new Image();
          img.onload = () => {
            const checkCanvas = document.createElement('canvas');
            checkCanvas.width = img.width;
            checkCanvas.height = img.height;
            const cCtx = checkCanvas.getContext('2d');
            if (!cCtx) return;
            cCtx.drawImage(img, 0, 0);
            const px = cCtx.getImageData(0, 0, checkCanvas.width, checkCanvas.height).data;
            let hasTransparency = false;
            for (let i = 3; i < px.length; i += 4) {
              if (px[i] < 255) {
                hasTransparency = true;
                break;
              }
            }
            if (!hasTransparency) {
              setUploadError(
                `Rejected "${file.name}": Uploaded PNG has an opaque background (no transparent pixels found).`
              );
              return;
            }
            setImageUrl(dataUrl);
            setUploadProgress(25);
            window.setTimeout(() => setUploadProgress(65), 180);
            window.setTimeout(() => setUploadProgress(100), 420);
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !brand.trim() || !sku.trim()) return;
    const item: FrameItem = {
      id: isNewMode ? `frm-${Date.now()}` : modalFrame!.id,
      sku: sku.trim(),
      brand: brand.trim(),
      name: name.trim(),
      price: Number(price) || 0,
      stock: Math.max(0, Number(stock) || 0),
      shelfLocation: shelfLocation.trim() || 'Rack A-1',
      imageUrl: imageUrl || '/assets/frames/frm-12.png',
      glbFileName: glbFileName || undefined,
      color: color.trim() || 'Matte Black',
      availableColors: modalFrame?.availableColors || [color.trim() || 'Matte Black', 'Tortoise'],
      material: material.trim() || 'Acetate',
      lensWidthMm: Number(lensWidthMm) || 50,
      bridgeWidthMm: Number(bridgeWidthMm) || 19,
      templeLengthMm: Number(templeLengthMm) || 145,
      style,
      suitableFaceShapes: suitableFaceShapes.length ? suitableFaceShapes : ['Oval'],
      genderTarget,
      modifiableLens,
      recentlyRestocked: true,
      favoriteCount: modalFrame?.favoriteCount || 1,
    };

    if (isNewMode) onAddFrame(item);
    else onUpdateFrame(item);
    closeModal();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Toolbar */}
      <div className="bg-white rounded-[24px] p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (highlightedFrameId) onClearHighlight();
            }}
            placeholder="Search SKU, frame name, brand, or shelf..."
            className="flex-1 h-[46px] bg-[#F2F6FA] border border-[#D4E0EA] rounded-full px-6 font-mono-ui text-[15px] text-black outline-none focus:ring-2 focus:ring-[#3BBEFF]"
          />
          {highlightedFrameId && (
            <button
              type="button"
              onClick={onClearHighlight}
              className="px-4 py-2 rounded-full bg-[#FFE4E4] text-[#CF3434] font-mono-ui text-[13px] font-semibold cursor-pointer"
            >
              Clear Alert Filter ✕
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="bg-[#176BA8] hover:bg-[#135A8E] text-white px-7 py-2.5 rounded-full font-mono-ui text-[16px] font-medium shadow cursor-pointer"
        >
          + Add New Frame
        </button>
      </div>

      {/* Data Table (D1 & D2) */}
      <div className="bg-white rounded-[24px] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono-ui text-[14px]">
            <thead>
              <tr className="bg-[#3BBEFF] text-white">
                {(
                  [
                    ['sku', 'SKU'],
                    ['name', 'Frame Name'],
                    ['brand', 'Brand'],
                    ['price', 'Price'],
                    ['stock', 'Stock'],
                    ['shelfLocation', 'Shelf Location'],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="py-3.5 px-4 font-semibold cursor-pointer select-none hover:bg-[#2CAEEB] whitespace-nowrap"
                  >
                    {label} {sortKey === key ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                ))}
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6ECF3]">
              {filteredSorted.map((frame) => {
                const isLowStock = frame.stock < 3;
                const isHighlighted = highlightedFrameId === frame.id;
                return (
                  <tr
                    key={frame.id}
                    className={`${
                      isLowStock ? 'low-stock-gradient' : 'bg-white hover:bg-[#F5FAFF]'
                    } ${isHighlighted ? 'ring-3 ring-inset ring-[#CF3434]' : ''}`}
                  >
                    <td className="py-3 px-4 font-semibold text-[#1A5878] whitespace-nowrap">
                      {frame.sku}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-9 bg-white rounded-lg p-1 flex items-center justify-center shrink-0 border border-[#E2E8F0]">
                          <FrameVisual
                            imageUrl={frame.imageUrl}
                            alt={frame.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div>
                          <div className="font-semibold text-black">{frame.name}</div>
                          <div className="text-[12px] text-[#5B6570]">
                            {frame.style} · {frame.lensWidthMm}-{frame.bridgeWidthMm}-
                            {frame.templeLengthMm}mm
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[#1F2937]">{frame.brand}</td>
                    <td className="py-3 px-4 font-semibold tabular-nums whitespace-nowrap">
                      {formatPhp(frame.price)}
                    </td>
                    <td className="py-3 px-4 tabular-nums">
                      <span
                        className={`px-3 py-0.5 rounded-full text-[13px] font-bold ${
                          isLowStock
                            ? 'bg-[#CF3434] text-white'
                            : 'bg-[#E5F7D8] text-[#1D6B12]'
                        }`}
                      >
                        {frame.stock}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#1F2937] whitespace-nowrap">
                      {frame.shelfLocation}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(frame)}
                        className="bg-[#176BA8] hover:bg-[#135A8E] text-white px-4 py-1.5 rounded-full text-[13px] cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmFrame(frame)}
                        className="bg-[#CF3434] hover:bg-[#B22626] text-white px-4 py-1.5 rounded-full text-[13px] cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Frame Modal */}
      {(isNewMode || modalFrame) && (
        <div
          className="fixed inset-0 z-50 bg-[#3C4B57]/72 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <form
            onSubmit={handleSaveModal}
            className="w-[960px] max-w-[96vw] max-h-[92vh] overflow-y-auto admin-scroll bg-white rounded-[32px] p-8 shadow-2xl flex flex-col gap-6"
          >
            <div className="w-full bg-[#3BBEFF] text-white text-center py-2.5 rounded-full font-mono-ui text-[24px] font-medium">
              {isNewMode ? 'Add New Frame (D1 & D2)' : `Edit Frame: ${modalFrame?.name}`}
            </div>

            {/* Section 1: Basic Info */}
            <div className="bg-[#F4F7FB] rounded-2xl p-5 space-y-4">
              <h4 className="font-mono-ui text-[17px] font-bold text-[#176BA8]">Basic Info</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono-ui text-[14px]">
                <div>
                  <label className="block mb-1 font-medium">Brand*</label>
                  <input
                    required
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-1 font-medium">Model Name*</label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Color</label>
                  <input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Material</label>
                  <input
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Frame Style</label>
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value as FrameStyle)}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  >
                    {ALL_FRAME_STYLES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-medium">Lens Width (mm)</label>
                  <input
                    type="number"
                    value={lensWidthMm}
                    onChange={(e) => setLensWidthMm(Number(e.target.value))}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Bridge Width (mm)</label>
                  <input
                    type="number"
                    value={bridgeWidthMm}
                    onChange={(e) => setBridgeWidthMm(Number(e.target.value))}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Temple Length (mm)</label>
                  <input
                    type="number"
                    value={templeLengthMm}
                    onChange={(e) => setTempleLengthMm(Number(e.target.value))}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1 font-mono-ui text-[13px]">
                <span className="font-semibold">Suitable Face Shapes:</span>
                {ALL_FACE_SHAPES.map((sh) => {
                  const active = suitableFaceShapes.includes(sh);
                  return (
                    <button
                      key={sh}
                      type="button"
                      onClick={() =>
                        setSuitableFaceShapes((prev) =>
                          prev.includes(sh) ? prev.filter((x) => x !== sh) : [...prev, sh]
                        )
                      }
                      className={`px-3 py-1 rounded-full cursor-pointer ${
                        active ? 'bg-[#176BA8] text-white' : 'bg-white border border-[#CBD5E1]'
                      }`}
                    >
                      {sh}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Retail Info */}
            <div className="bg-[#F4F7FB] rounded-2xl p-5 space-y-4">
              <h4 className="font-mono-ui text-[17px] font-bold text-[#176BA8]">Retail Info</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono-ui text-[14px]">
                <div>
                  <label className="block mb-1 font-medium">SKU*</label>
                  <input
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Price (PHP)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Stock Quantity</label>
                  <input
                    type="number"
                    value={stock}
                    onChange={(e) => setStock(Number(e.target.value))}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  />
                </div>
                <div>
                  <label className="block mb-1 font-medium">Shelf Location</label>
                  <input
                    value={shelfLocation}
                    onChange={(e) => setShelfLocation(e.target.value)}
                    className="w-full h-10 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6 font-mono-ui text-[14px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modifiableLens}
                    onChange={(e) => setModifiableLens(e.target.checked)}
                    className="w-4 h-4 accent-[#176BA8]"
                  />
                  <span>With Modifiable Lens</span>
                </label>
                <div className="flex items-center gap-2">
                  <span>Target:</span>
                  <select
                    value={genderTarget}
                    onChange={(e) =>
                      setGenderTarget(
                        e.target.value as 'Unisex' | 'Male-Centric' | 'Female-Centric'
                      )
                    }
                    className="h-9 bg-white border border-[#CBD5E1] rounded-xl px-3"
                  >
                    <option value="Unisex">Unisex</option>
                    <option value="Male-Centric">Male-Centric</option>
                    <option value="Female-Centric">Female-Centric</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 3: AR Asset Upload */}
            <div className="bg-[#F4F7FB] rounded-2xl p-5 space-y-3">
              <h4 className="font-mono-ui text-[17px] font-bold text-[#176BA8]">
                AR Asset Upload (.glb 3D Model & Transparent PNG Thumbnail)
              </h4>
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleAssetDropOrSelect(e.dataTransfer.files);
                }}
                className="flex flex-col md:flex-row items-center justify-between gap-4 border-2 border-dashed border-[#3BBEFF] bg-white rounded-2xl p-5 cursor-pointer hover:bg-[#F2FAFF]"
              >
                <input
                  type="file"
                  multiple
                  accept=".glb,.gltf,.png"
                  onChange={(e) => handleAssetDropOrSelect(e.target.files)}
                  className="hidden"
                />
                <div className="font-mono-ui text-[14px] text-[#374151]">
                  <div className="font-semibold text-[#176BA8]">
                    Drag & drop .glb 3D model or transparent .png thumbnail here, or click to browse
                  </div>
                  <div className="text-[12px] text-[#6B747E] mt-1">
                    3D Asset: {glbFileName || 'None uploaded'} · Thumbnail must be front-facing transparent PNG
                  </div>
                </div>
                <div className="w-24 h-16 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] flex items-center justify-center p-1 shrink-0">
                  <FrameVisual
                    imageUrl={imageUrl}
                    alt="Thumbnail preview"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              </label>

              {uploadError && (
                <div className="px-4 py-2.5 rounded-xl bg-[#FFE4E4] border border-[#F5B7B7] font-mono-ui text-[13px] text-[#B91C1C] font-semibold">
                  {uploadError}
                </div>
              )}

              {uploadProgress > 0 && (
                <div className="space-y-1">
                  <div className="w-full h-3 bg-[#DCE6EE] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#3BBEFF] transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="font-mono-ui text-[12px] text-[#176BA8]">
                    {uploadProgress === 100
                      ? '✓ Asset ready for AR Kiosk preview'
                      : `Uploading... ${uploadProgress}%`}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-8 pt-2">
              <ReturnButton onClick={closeModal} className="w-[220px]" />
              <button
                type="submit"
                className="w-[220px] h-[54px] rounded-full bg-[#176BA8] hover:bg-[#135A8E] text-white font-mono-ui text-[22px] font-medium shadow-md cursor-pointer"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmFrame && (
        <div className="fixed inset-0 z-50 bg-[#3C4B57]/72 flex items-center justify-center">
          <div className="w-[580px] max-w-[92vw] bg-white rounded-[32px] p-8 shadow-2xl flex flex-col gap-6">
            <div className="w-full bg-[#3BBEFF] text-white text-center py-2.5 rounded-full font-mono-ui text-[23px]">
              Delete Frame?
            </div>
            <p className="font-mono-ui text-[17px] text-center text-[#1F2937]">
              Remove <span className="font-bold">{deleteConfirmFrame.name}</span> (
              {deleteConfirmFrame.sku}) from Data Store D1 & D2?
            </p>
            <div className="flex justify-center gap-6">
              <button
                type="button"
                onClick={() => {
                  onDeleteFrame(deleteConfirmFrame.id);
                  setDeleteConfirmFrame(null);
                }}
                className="w-[190px] h-[48px] rounded-full bg-[#CF3434] hover:bg-[#B22626] text-white font-mono-ui text-[19px] cursor-pointer"
              >
                Delete
              </button>
              <ReturnButton onClick={() => setDeleteConfirmFrame(null)} className="w-[190px]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
