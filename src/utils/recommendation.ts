import {
  CustomerPrescription,
  FaceShape,
  FacialScanResult,
  FrameItem,
  LensCatalogStore,
  RankedFrameResult,
  RulesEngineStore,
} from '../types/framefit';

export function formatPhp(amount: number): string {
  return `Php ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function generateFacialScan(seedName: string): FacialScanResult {
  const shapes: FaceShape[] = ['Round', 'Oval', 'Square', 'Heart', 'Diamond'];
  const hash = seedName
    .trim()
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const faceShape = seedName ? shapes[hash % shapes.length] : 'Round';
  const eyeDistanceMm = Number((60.5 + (hash % 7) * 0.8).toFixed(1));
  const nasalWidthMm = Number((17.0 + (hash % 5) * 0.6).toFixed(1));
  const faceWidthMm = Number((132 + (hash % 11) * 1.4).toFixed(1));
  const jawlineProfiles: Record<FaceShape, string> = {
    Oval: 'Balanced & Soft Contour',
    Round: 'Soft Curved Cheekbone',
    Square: 'Defined Angular Jawline',
    Heart: 'Tapered Chin & Wide Brow',
    Diamond: 'High Cheekbone & Narrow Chin',
    Oblong: 'Elongated Vertical Symmetry',
    Triangle: 'Broad Jawline & Tapered Forehead',
  };

  const jawWidthMm = Number((faceWidthMm * 0.82).toFixed(1));
  const foreheadWidthMm = Number((faceWidthMm * 0.88).toFixed(1));
  const faceLengthMm = Number((faceWidthMm * 1.32).toFixed(1));
  const jawlineLengthMm = Number((faceWidthMm * 0.78).toFixed(1));

  return {
    faceShape,
    eyeDistanceMm,
    nasalWidthMm,
    nasalLengthMm: 47.5,
    faceWidthMm,
    cheekboneWidthMm: faceWidthMm,
    jawWidthMm,
    jawlineWidthMm: jawWidthMm,
    jawlineLengthMm,
    foreheadWidthMm,
    faceLengthMm,
    jawlineProfile: jawlineProfiles[faceShape],
  };
}

export function computeFrameSuitability(
  frame: FrameItem,
  scan: FacialScanResult,
  rules: RulesEngineStore,
  budgetPhp?: number,
  targetFaceShape?: FaceShape | null
): {
  score: number;
  eyeDistanceNote: string;
  nasalNote: string;
  otherFitNote: string;
} {
  const { faceShapeMatrix, weights } = rules;
  const totalWeight =
    weights.faceShapeSuitability +
      weights.facialMeasurementFit +
      weights.budgetStockPriority || 100;

  const activeShape = targetFaceShape || scan.faceShape;
  const matchedStyles = faceShapeMatrix[activeShape] || [];

  // 1. Face Shape Suitability (0-100)
  const styleMatch = matchedStyles.includes(frame.style);
  const shapeTagMatch = frame.suitableFaceShapes.includes(activeShape);
  const shapeScore = styleMatch && shapeTagMatch ? 98 : styleMatch || shapeTagMatch ? 82 : 58;

  // 2. Facial Measurement Fit (0-100)
  const estimatedFramePd = frame.lensWidthMm + frame.bridgeWidthMm / 2 + 2;
  const pdDiff = Math.abs(estimatedFramePd - scan.eyeDistanceMm);
  const bridgeDiff = Math.abs(frame.bridgeWidthMm - scan.nasalWidthMm);
  const measurementScore = Math.max(
    55,
    Math.round(100 - pdDiff * 3.5 - bridgeDiff * 4.5)
  );

  // 3. Budget / Stock Priority (0-100)
  let affordability: number;
  if (typeof budgetPhp === 'number' && budgetPhp > 0) {
    affordability = frame.price <= budgetPhp ? 96 : Math.max(40, Math.round(90 - ((frame.price - budgetPhp) / budgetPhp) * 60));
  } else {
    affordability = frame.price <= 2500 ? 94 : frame.price <= 6500 ? 82 : 70;
  }
  const stockBonus = frame.stock >= 5 ? 6 : frame.stock > 0 ? 0 : -12;
  const budgetStockScore = Math.min(100, Math.max(40, affordability + stockBonus));

  const weightedScore = Math.round(
    (shapeScore * weights.faceShapeSuitability +
      measurementScore * weights.facialMeasurementFit +
      budgetStockScore * weights.budgetStockPriority) /
      totalWeight
  );

  const eyeGap = Number(Math.abs(estimatedFramePd - scan.eyeDistanceMm).toFixed(1));
  const nasalGap = Number(Math.abs(frame.bridgeWidthMm - scan.nasalWidthMm).toFixed(1));

  return {
    score: weightedScore,
    eyeDistanceNote: `${frame.lensWidthMm}mm lens (${eyeGap <= 2.5 ? 'Optimal' : 'Good'} PD fit)`,
    nasalNote: `${frame.bridgeWidthMm}mm bridge (${nasalGap <= 1.8 ? 'Snug' : 'Relaxed'})`,
    otherFitNote: `${frame.style} · ${styleMatch ? 'Matches face' : 'Contrast fit'} (${weightedScore}%)`,
  };
}

export function rankSelectedFrames(
  selectedFrames: FrameItem[],
  scan: FacialScanResult,
  rules: RulesEngineStore,
  budgetPhp?: number
): RankedFrameResult[] {
  const scored = selectedFrames.map((frame) => {
    const res = computeFrameSuitability(frame, scan, rules, budgetPhp);
    return {
      frame,
      ...res,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const labels = ['Best Fit', 'Great Fit', 'Good Fit', 'Fair Fit', 'Alternative'];
  return scored.map((item, idx) => ({
    frame: item.frame,
    rank: idx + 1,
    score: item.score,
    fitLabel: labels[Math.min(idx, labels.length - 1)],
    eyeDistanceNote: item.eyeDistanceNote,
    nasalNote: item.nasalNote,
    otherFitNote: item.otherFitNote,
  }));
}

export function requiresHighIndexFromPrescription(rx: CustomerPrescription): boolean {
  if (!rx.hasPrescription) return false;
  const l = parseFloat(rx.leftGrade);
  const r = parseFloat(rx.rightGrade);
  return (!Number.isNaN(l) && Math.abs(l) >= 4.0) || (!Number.isNaN(r) && Math.abs(r) >= 4.0);
}

export function getEstimatedLensPrice(
  lensCatalog: LensCatalogStore,
  rx: CustomerPrescription,
  lensTypeId: string,
  selectedCoatingIds: string[]
): number {
  if (rx.hasPrescription === false) return 0;
  const enabledLensTypes = lensCatalog.lensTypes.filter((l) => l.enabled);
  const activeLens =
    enabledLensTypes.find((l) => l.id === lensTypeId) || enabledLensTypes[0];
  const base = activeLens?.basePrice || 0;
  const coatings = lensCatalog.coatings
    .filter((c) => selectedCoatingIds.includes(c.id))
    .reduce((sum, c) => sum + c.addOnPrice, 0);
  const highIndex = requiresHighIndexFromPrescription(rx)
    ? lensCatalog.highIndexAddOnPrice
    : 0;
  return base + coatings + highIndex;
}

export function formatPrescriptionSummary(rx: CustomerPrescription): string {
  if (!rx.hasPrescription) return 'No Prescription (Plano)';
  const l = rx.leftGrade || '0.00';
  const r = rx.rightGrade || '0.00';
  const pd = rx.pdMm ? ` · PD ${rx.pdMm}mm` : '';
  if (rx.astigmatism) {
    return `OD ${r} (${rx.rightCyl || '-0.50'}x${rx.rightAxis || '90'}) / OS ${l} (${rx.leftCyl || '-0.50'}x${rx.leftAxis || '90'})${pd}`;
  }
  return `OD ${r} / OS ${l}${pd}`;
}
