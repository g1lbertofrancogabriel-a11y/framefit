export type FaceShape =
  | 'Oval'
  | 'Round'
  | 'Square'
  | 'Heart'
  | 'Diamond'
  | 'Oblong'
  | 'Triangle';

export type FrameStyle =
  | 'Rectangular'
  | 'Square'
  | 'Round'
  | 'Wayfarer'
  | 'Cat-eye'
  | 'Aviator'
  | 'Oval'
  | 'Browline/Clubmaster'
  | 'Geometric';

export type OrganizeFilter =
  | 'Most Accurate to Face Shape'
  | 'Highest Price'
  | 'Least Price'
  | 'With Modifiable Lens'
  | 'Most Stocks Available'
  | 'Least Stocks Available'
  | 'Recently Restocked'
  | 'Male-Centric'
  | 'Female-Centric';

export interface FrameItem {
  id: string;
  sku: string;
  brand: string;
  name: string;
  price: number;
  stock: number;
  shelfLocation: string;
  imageUrl: string;
  glbFileName?: string;
  color: string;
  availableColors: string[];
  material: string;
  lensWidthMm: number;
  bridgeWidthMm: number;
  templeLengthMm: number;
  style: FrameStyle;
  suitableFaceShapes: FaceShape[];
  genderTarget: 'Unisex' | 'Male-Centric' | 'Female-Centric';
  modifiableLens: boolean;
  recentlyRestocked: boolean;
  favoriteCount: number;
}

export interface LensTypeOption {
  id: 'single-vision' | 'bifocal' | 'progressive';
  name: string;
  description: string;
  basePrice: number;
  enabled: boolean;
}

export interface LensCoatingOption {
  id: 'anti-reflective' | 'blue-light' | 'scratch-resistant';
  name: string;
  description: string;
  addOnPrice: number;
  enabledByDefault: boolean;
}

export interface CompatibilityRule {
  id: string;
  condition: string;
  action: string;
}

export interface LensCatalogStore {
  lensTypes: LensTypeOption[];
  coatings: LensCoatingOption[];
  compatibilityRules: CompatibilityRule[];
  highIndexAddOnPrice: number;
}

export interface RulesEngineStore {
  faceShapeMatrix: Record<FaceShape, FrameStyle[]>;
  weights: {
    faceShapeSuitability: number;
    facialMeasurementFit: number;
    budgetStockPriority: number;
  };
}

export interface UsageSessionRecord {
  id: string;
  date: string; // YYYY-MM-DD
  framesTriedCount: number;
  detectedFaceShape: FaceShape;
  favoritedFrameIds: string[];
  selectedFrameId?: string;
  summaryPrintedOrSent: boolean;
}

export interface AdminAccessLog {
  id: string;
  username: string;
  timestamp: string;
  device: 'Kiosk-01' | 'Kiosk-02' | 'Store-PC';
  result: 'Success' | 'Failed' | 'Locked Out' | 'Logged Out';
}

export interface SystemErrorLog {
  id: string;
  timestamp: string;
  device: 'Kiosk-01' | 'Kiosk-02' | 'Store-PC';
  errorType: string;
  description: string;
  status: 'Resolved' | 'Open';
}

export interface CustomerPrescription {
  hasPrescription: boolean | null;
  leftGrade: string;
  rightGrade: string;
  astigmatism: boolean;
  leftCyl: string;
  leftAxis: string;
  rightCyl: string;
  rightAxis: string;
  pdMm?: string;
}

export interface NormalizedLandmarkPoint {
  x: number;
  y: number;
  z: number;
}

export interface FacialScanResult {
  faceShape: FaceShape;
  eyeDistanceMm: number;
  nasalWidthMm: number;
  nasalLengthMm: number;
  faceWidthMm: number;
  cheekboneWidthMm: number;
  jawWidthMm: number;
  jawlineWidthMm: number;
  jawlineLengthMm: number;
  foreheadWidthMm: number;
  faceLengthMm: number;
  jawlineProfile: string;
  capturedPhotoDataUrl?: string;
  capturedWidth?: number;
  capturedHeight?: number;
  capturedLandmarks?: NormalizedLandmarkPoint[];
  sketchFaceDataUrl?: string;
  sketchWidth?: number;
  sketchHeight?: number;
  sketchLandmarks?: NormalizedLandmarkPoint[];
}

export interface RankedFrameResult {
  frame: FrameItem;
  rank: number;
  score: number;
  fitLabel: string;
  eyeDistanceNote: string;
  nasalNote: string;
  otherFitNote: string;
}

export type KioskPageId =
  | 'P1'
  | 'P2'
  | 'P3'
  | 'P4'
  | 'P5'
  | 'P6'
  | 'P7'
  | 'P9'
  | 'P10'
  | 'P11'
  | 'P16'
  | 'P17'
  | 'P18'
  | 'P19'
  | 'P20'
  | 'P21'
  | 'P22';

export type AdminTabId =
  | 'dashboard'
  | 'frame-catalog'
  | 'lens-catalog'
  | 'rules-engine'
  | 'reports'
  | 'system-logs';

export interface StaffAccount {
  username: string;
  password: string;
  displayName: string;
  role: string;
}
