import {
  FaceLandmarker,
  FilesetResolver,
  ImageSegmenter,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { FaceShape, FacialScanResult, NormalizedLandmarkPoint } from '../types/framefit';

// ---------- MediaPipe Landmark Index Constants ----------
export const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

export const LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const RIGHT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
export const NOSE_OUTLINE_INDICES = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 326, 327, 294, 278, 344, 440, 456, 198, 209, 49, 48, 219, 166, 79, 239, 97, 2];

export const LEFT_IRIS_CENTER = 468;
export const LEFT_IRIS_RING = [469, 470, 471, 472];
export const RIGHT_IRIS_CENTER = 473;
export const RIGHT_IRIS_RING = [474, 475, 476, 477];

export const LEFT_JAWLINE_INDICES = [132, 172, 136, 150, 149, 176, 148, 152];
export const RIGHT_JAWLINE_INDICES = [361, 397, 365, 379, 378, 400, 377, 152];

// Key 3D anthropometric landmark points displayed as live tracking dots
export const LANDMARK_MEASUREMENT_DOTS = [
  10,  // Forehead top (trichion)
  54,  // Left temple
  284, // Right temple
  168, // Glabella / nasal bridge top
  2,   // Nasal base (subnasale)
  193, // Left nasal bridge side
  417, // Right nasal bridge side
  33,  // Left outer eye corner
  133, // Left inner eye corner
  362, // Right inner eye corner
  263, // Right outer eye corner
  234, // Left cheekbone (zygion)
  454, // Right cheekbone (zygion)
  132, // Left jaw root
  361, // Right jaw root
  172, // Left jaw angle (gonion)
  397, // Right jaw angle (gonion)
  152, // Chin (menton)
];

// ---------- One-Euro Filter for Zero-Jitter Landmark Tracking ----------
class LowPassFilter {
  private y = 0;
  private s = 0;
  private initialized = false;

  filter(value: number, alpha: number): number {
    if (!this.initialized) {
      this.s = value;
      this.initialized = true;
    } else {
      this.s = alpha * value + (1 - alpha) * this.s;
    }
    this.y = value;
    return this.s;
  }

  lastRaw(): number {
    return this.y;
  }

  reset(): void {
    this.initialized = false;
  }
}

class OneEuroFilter1D {
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  constructor(
    private minCutoff = 1.4,
    private beta = 0.035,
    private dCutoff = 1.0
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, timestampSec: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestampSec;
      this.dxFilter.filter(0, 1);
      return this.xFilter.filter(x, 1);
    }
    const dt = Math.max(1 / 120, Math.min(0.2, timestampSec - this.lastTime));
    this.lastTime = timestampSec;

    const dx = (x - this.xFilter.lastRaw()) / dt;
    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(x, this.alpha(cutoff, dt));
  }

  reset(): void {
    this.lastTime = null;
    this.xFilter.reset();
    this.dxFilter.reset();
  }
}

export class LandmarkSmoother {
  private filters: Array<[OneEuroFilter1D, OneEuroFilter1D, OneEuroFilter1D]> = [];

  smooth(landmarks: NormalizedLandmark[], timestampMs: number): NormalizedLandmarkPoint[] {
    const tSec = timestampMs / 1000;
    if (this.filters.length !== landmarks.length) {
      this.filters = landmarks.map(() => [
        new OneEuroFilter1D(1.5, 0.04, 1.0),
        new OneEuroFilter1D(1.5, 0.04, 1.0),
        new OneEuroFilter1D(1.2, 0.03, 1.0),
      ]);
    }
    return landmarks.map((lm, i) => ({
      x: this.filters[i][0].filter(lm.x, tSec),
      y: this.filters[i][1].filter(lm.y, tSec),
      z: this.filters[i][2].filter(lm.z ?? 0, tSec),
    }));
  }

  reset(): void {
    this.filters = [];
  }
}

// ---------- MediaPipe Singleton Loader ----------
let landmarkerPromise: Promise<FaceLandmarker> | null = null;

export function runWithFilteredMediaPipeInfo<T>(fn: () => T): T {
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (
      first.includes('Created TensorFlow Lite XNNPACK delegate') ||
      /^INFO:\s/i.test(first)
    ) {
      console.info(...args);
      return;
    }
    origError.apply(console, args);
  };
  try {
    return fn();
  } finally {
    console.error = origError;
  }
}

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      const first = typeof args[0] === 'string' ? args[0] : '';
      if (
        first.includes('Created TensorFlow Lite XNNPACK delegate') ||
        /^INFO:\s/i.test(first)
      ) {
        console.info(...args);
        return;
      }
      origError.apply(console, args);
    };

    try {
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      try {
        return await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 4,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true,
          minFaceDetectionConfidence: 0.55,
          minFacePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        });
      } catch {
        try {
          // Fallback to CPU delegate if GPU unavailable
          return await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/mediapipe/face_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numFaces: 4,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: true,
            minFaceDetectionConfidence: 0.55,
            minFacePresenceConfidence: 0.55,
            minTrackingConfidence: 0.55,
          });
        } catch (err) {
          landmarkerPromise = null;
          throw err;
        }
      }
    } finally {
      console.error = origError;
    }
  })();
  return landmarkerPromise;
}

let segmenterPromise: Promise<ImageSegmenter> | null = null;

export async function getImageSegmenter(): Promise<ImageSegmenter> {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      const first = typeof args[0] === 'string' ? args[0] : '';
      if (
        first.includes('Created TensorFlow Lite XNNPACK delegate') ||
        /^INFO:\s/i.test(first)
      ) {
        console.info(...args);
        return;
      }
      origError.apply(console, args);
    };

    try {
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      try {
        return await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/selfie_segmenter.tflite',
            delegate: 'GPU',
          },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      } catch {
        try {
          return await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/mediapipe/selfie_segmenter.tflite',
              delegate: 'CPU',
            },
            runningMode: 'IMAGE',
            outputConfidenceMasks: true,
            outputCategoryMask: false,
          });
        } catch (err) {
          segmenterPromise = null;
          throw err;
        }
      }
    } finally {
      console.error = origError;
    }
  })();
  return segmenterPromise;
}

// ---------- Nearest Face Locking & Bounding Geometry ----------
export interface FaceLockCandidate {
  index: number;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
}

export function selectNearestFace(
  faces: NormalizedLandmark[][],
  prevLock: { cx: number; cy: number; area: number } | null
): FaceLockCandidate | null {
  if (!faces || faces.length === 0) return null;

  const candidates: FaceLockCandidate[] = faces.map((lms, index) => {
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const p of lms) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const width = Math.max(0.01, maxX - minX);
    const height = Math.max(0.01, maxY - minY);
    return {
      index,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      minX,
      minY,
      maxX,
      maxY,
      width,
      height,
      area: width * height,
    };
  });

  // If previously locked, stick to that face by position unless another face is significantly closer (>45% larger)
  if (prevLock) {
    let bestTracked: FaceLockCandidate | null = null;
    let minDist = Infinity;
    for (const c of candidates) {
      const dist = Math.hypot(c.cx - prevLock.cx, c.cy - prevLock.cy);
      if (dist < 0.16 && dist < minDist) {
        minDist = dist;
        bestTracked = c;
      }
    }
    if (bestTracked) {
      const muchCloser = candidates.find(
        (c) => c.index !== bestTracked!.index && c.area > bestTracked!.area * 1.45
      );
      if (!muchCloser) return bestTracked;
    }
  }

  // Score by largest area (nearest camera) and proximity to center crosshair (0.5, 0.5)
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const centerDist = Math.hypot(c.cx - 0.5, c.cy - 0.5);
    const score = c.area * 10 - centerDist * 0.55;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

// ---------- Head Pose & Iris-Scaled Facial Measurements ----------
export interface LiveFaceMetrics {
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
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  faceShape: FaceShape;
  jawlineProfile: string;
  guidanceHint: string | null;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const JAWLINE_PROFILES: Record<FaceShape, string> = {
  Oval: 'Balanced & Soft Contour',
  Round: 'Soft Curved Cheekbone',
  Square: 'Defined Angular Jawline',
  Heart: 'Tapered Chin & Wide Brow',
  Diamond: 'High Cheekbone & Narrow Chin',
  Oblong: 'Elongated Vertical Symmetry',
  Triangle: 'Broad Jawline & Tapered Forehead',
};

function distPx(
  a: NormalizedLandmarkPoint,
  b: NormalizedLandmarkPoint,
  w: number,
  h: number
): number {
  return Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
}

function irisDiameterPx(
  landmarks: NormalizedLandmarkPoint[],
  ringIndices: number[],
  w: number,
  h: number
): number {
  if (landmarks.length <= 477) return 0;
  // Horizontal + vertical span across iris ring landmarks (left/right vs top/bottom)
  const d1 = distPx(landmarks[ringIndices[0]], landmarks[ringIndices[2]], w, h);
  const d2 = distPx(landmarks[ringIndices[1]], landmarks[ringIndices[3]], w, h);
  return (d1 + d2) / 2;
}

function angleDegAtVertex(
  a: NormalizedLandmarkPoint,
  v: NormalizedLandmarkPoint,
  b: NormalizedLandmarkPoint,
  w: number,
  h: number
): number {
  const v1x = (a.x - v.x) * w;
  const v1y = (a.y - v.y) * h;
  const v2x = (b.x - v.x) * w;
  const v2y = (b.y - v.y) * h;
  const dot = v1x * v2x + v1y * v2y;
  const mag = Math.max(1e-6, Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y));
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

function polylineLengthPx(
  landmarks: NormalizedLandmarkPoint[],
  indices: number[],
  w: number,
  h: number
): number {
  let total = 0;
  for (let i = 1; i < indices.length; i++) {
    const a = landmarks[indices[i - 1]];
    const b = landmarks[indices[i]];
    if (a && b) total += distPx(a, b, w, h);
  }
  return total;
}

interface FaceShapeFeatures {
  aspect: number; // face length / cheekbone width
  foreheadRatio: number; // forehead width / cheekbone width
  jawRatio: number; // jawline width / cheekbone width
  jawlineLengthRatio: number; // jawline length / cheekbone width
  foreheadVsJaw: number; // forehead width / jawline width
  chinTaper: number; // lower chin-jaw width (149-378) / gonion jaw width (172-397)
  jawAngleDeg: number; // average gonion angle (234-172-152 & 454-397-152)
}

interface ShapePrototype {
  shape: FaceShape;
  aspect: [number, number];
  foreheadRatio: [number, number];
  jawRatio: [number, number];
  jawlineLengthRatio: [number, number];
  foreheadVsJaw: [number, number];
  chinTaper: [number, number];
  jawAngleDeg: [number, number];
  weights: {
    aspect: number;
    foreheadRatio: number;
    jawRatio: number;
    jawlineLengthRatio: number;
    foreheadVsJaw: number;
    chinTaper: number;
    jawAngleDeg: number;
  };
}

const FACE_SHAPE_PROTOTYPES: ShapePrototype[] = [
  {
    shape: 'Oval',
    aspect: [1.35, 0.085],
    foreheadRatio: [0.83, 0.05],
    jawRatio: [0.8, 0.05],
    jawlineLengthRatio: [0.79, 0.05],
    foreheadVsJaw: [1.03, 0.06],
    chinTaper: [0.64, 0.05],
    jawAngleDeg: [140, 7],
    weights: {
      aspect: 1.5,
      foreheadRatio: 1.0,
      jawRatio: 1.2,
      jawlineLengthRatio: 1.1,
      foreheadVsJaw: 1.0,
      chinTaper: 1.1,
      jawAngleDeg: 1.1,
    },
  },
  {
    shape: 'Round',
    aspect: [1.18, 0.075],
    foreheadRatio: [0.83, 0.05],
    jawRatio: [0.82, 0.05],
    jawlineLengthRatio: [0.74, 0.05],
    foreheadVsJaw: [1.01, 0.06],
    chinTaper: [0.65, 0.05],
    jawAngleDeg: [142, 6],
    weights: {
      aspect: 2.0,
      foreheadRatio: 0.9,
      jawRatio: 1.1,
      jawlineLengthRatio: 1.3,
      foreheadVsJaw: 1.0,
      chinTaper: 1.1,
      jawAngleDeg: 1.6,
    },
  },
  {
    shape: 'Square',
    aspect: [1.22, 0.08],
    foreheadRatio: [0.86, 0.05],
    jawRatio: [0.89, 0.045],
    jawlineLengthRatio: [0.82, 0.05],
    foreheadVsJaw: [0.98, 0.06],
    chinTaper: [0.71, 0.045],
    jawAngleDeg: [129, 5.5],
    weights: {
      aspect: 1.4,
      foreheadRatio: 1.1,
      jawRatio: 1.8,
      jawlineLengthRatio: 1.3,
      foreheadVsJaw: 1.0,
      chinTaper: 1.6,
      jawAngleDeg: 1.8,
    },
  },
  {
    shape: 'Heart',
    aspect: [1.33, 0.09],
    foreheadRatio: [0.87, 0.045],
    jawRatio: [0.75, 0.05],
    jawlineLengthRatio: [0.75, 0.05],
    foreheadVsJaw: [1.13, 0.06],
    chinTaper: [0.59, 0.05],
    jawAngleDeg: [138, 7],
    weights: {
      aspect: 0.9,
      foreheadRatio: 1.5,
      jawRatio: 1.4,
      jawlineLengthRatio: 1.1,
      foreheadVsJaw: 2.1,
      chinTaper: 1.5,
      jawAngleDeg: 0.8,
    },
  },
  {
    shape: 'Diamond',
    aspect: [1.35, 0.09],
    foreheadRatio: [0.77, 0.045],
    jawRatio: [0.75, 0.045],
    jawlineLengthRatio: [0.76, 0.05],
    foreheadVsJaw: [1.02, 0.06],
    chinTaper: [0.59, 0.05],
    jawAngleDeg: [137, 7],
    weights: {
      aspect: 1.0,
      foreheadRatio: 1.9,
      jawRatio: 1.9,
      jawlineLengthRatio: 1.1,
      foreheadVsJaw: 1.0,
      chinTaper: 1.4,
      jawAngleDeg: 0.8,
    },
  },
  {
    shape: 'Oblong',
    aspect: [1.5, 0.07],
    foreheadRatio: [0.84, 0.06],
    jawRatio: [0.82, 0.06],
    jawlineLengthRatio: [0.87, 0.055],
    foreheadVsJaw: [1.02, 0.07],
    chinTaper: [0.65, 0.06],
    jawAngleDeg: [136, 8],
    weights: {
      aspect: 2.5,
      foreheadRatio: 0.8,
      jawRatio: 0.8,
      jawlineLengthRatio: 1.4,
      foreheadVsJaw: 0.8,
      chinTaper: 0.8,
      jawAngleDeg: 0.7,
    },
  },
  {
    shape: 'Triangle',
    aspect: [1.31, 0.09],
    foreheadRatio: [0.77, 0.05],
    jawRatio: [0.89, 0.045],
    jawlineLengthRatio: [0.83, 0.05],
    foreheadVsJaw: [0.88, 0.055],
    chinTaper: [0.69, 0.05],
    jawAngleDeg: [131, 7],
    weights: {
      aspect: 0.9,
      foreheadRatio: 1.5,
      jawRatio: 1.6,
      jawlineLengthRatio: 1.3,
      foreheadVsJaw: 2.2,
      chinTaper: 1.2,
      jawAngleDeg: 1.0,
    },
  },
];

export function classifyFaceShape(features: FaceShapeFeatures): FaceShape {
  let bestShape: FaceShape = 'Oval';
  let lowestCost = Infinity;

  for (const proto of FACE_SHAPE_PROTOTYPES) {
    const z = (val: number, [mean, sigma]: [number, number]) => (val - mean) / sigma;
    const cost =
      proto.weights.aspect * z(features.aspect, proto.aspect) ** 2 +
      proto.weights.foreheadRatio * z(features.foreheadRatio, proto.foreheadRatio) ** 2 +
      proto.weights.jawRatio * z(features.jawRatio, proto.jawRatio) ** 2 +
      proto.weights.jawlineLengthRatio *
        z(features.jawlineLengthRatio, proto.jawlineLengthRatio) ** 2 +
      proto.weights.foreheadVsJaw * z(features.foreheadVsJaw, proto.foreheadVsJaw) ** 2 +
      proto.weights.chinTaper * z(features.chinTaper, proto.chinTaper) ** 2 +
      proto.weights.jawAngleDeg * z(features.jawAngleDeg, proto.jawAngleDeg) ** 2;

    if (cost < lowestCost) {
      lowestCost = cost;
      bestShape = proto.shape;
    }
  }

  return bestShape;
}

export function extractHeadPoseDeg(
  matrixData: number[] | Float32Array | undefined,
  landmarks: NormalizedLandmarkPoint[],
  w: number,
  h: number
): { yawDeg: number; pitchDeg: number; rollDeg: number } {
  if (matrixData && matrixData.length >= 16) {
    // Three.js / MediaPipe column-major 4x4 transformation matrix
    const r00 = matrixData[0];
    const r10 = matrixData[1];
    const r20 = matrixData[2];
    const r21 = matrixData[6];
    const r22 = matrixData[10];

    const sy = Math.hypot(r00, r10);
    const pitch = (Math.atan2(r21, r22) * 180) / Math.PI;
    const yaw = (Math.atan2(-r20, sy) * 180) / Math.PI;
    const roll = (Math.atan2(r10, r00) * 180) / Math.PI;
    return { yawDeg: yaw, pitchDeg: pitch, rollDeg: roll };
  }

  // Fallback geometric pose estimate
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const noseTip = landmarks[1];
  const rollDeg =
    (Math.atan2((rightEye.y - leftEye.y) * h, (rightEye.x - leftEye.x) * w) * 180) / Math.PI;
  const midEyeX = (leftEye.x + rightEye.x) / 2;
  const eyeSpan = Math.max(0.01, rightEye.x - leftEye.x);
  const yawDeg = ((noseTip.x - midEyeX) / eyeSpan) * 60;
  const midEyeY = (leftEye.y + rightEye.y) / 2;
  const chin = landmarks[152];
  const pitchRatio = (noseTip.y - midEyeY) / Math.max(0.01, chin.y - midEyeY);
  const pitchDeg = (pitchRatio - 0.42) * 70;
  return { yawDeg, pitchDeg, rollDeg };
}

export function computeLiveFaceMetrics(
  landmarks: NormalizedLandmarkPoint[],
  videoWidth: number,
  videoHeight: number,
  meanLuma: number,
  matrixData?: number[] | Float32Array
): LiveFaceMetrics {
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

  const faceBoxWidthFrac = maxX - minX;
  const { yawDeg, pitchDeg, rollDeg } = extractHeadPoseDeg(
    matrixData,
    landmarks,
    videoWidth,
    videoHeight
  );

  // Scale reference: average human iris diameter = 11.7 mm
  const leftIrisPx = irisDiameterPx(landmarks, LEFT_IRIS_RING, videoWidth, videoHeight);
  const rightIrisPx = irisDiameterPx(landmarks, RIGHT_IRIS_RING, videoWidth, videoHeight);
  let mmPerPx: number;
  if (leftIrisPx > 4 && rightIrisPx > 4) {
    const avgIrisPx = (leftIrisPx + rightIrisPx) / 2;
    mmPerPx = 11.7 / avgIrisPx;
  } else {
    // Fallback proportional inter-ocular calibration (~63mm average)
    const eyeCenterDistPx = distPx(landmarks[33], landmarks[263], videoWidth, videoHeight);
    mmPerPx = 92 / Math.max(20, eyeCenterDistPx);
  }

  const leftIrisCenter = landmarks[LEFT_IRIS_CENTER] || landmarks[159];
  const rightIrisCenter = landmarks[RIGHT_IRIS_CENTER] || landmarks[386];

  // Pose foreshortening compensation for front-facing horizontal & vertical spans
  const cosYaw = Math.max(0.84, Math.cos((Math.min(32, Math.abs(yawDeg)) * Math.PI) / 180));
  const cosPitch = Math.max(0.84, Math.cos((Math.min(32, Math.abs(pitchDeg)) * Math.PI) / 180));

  const rawEyeDistanceMm = (distPx(leftIrisCenter, rightIrisCenter, videoWidth, videoHeight) / cosYaw) * mmPerPx;
  const rawNasalWidthMm = (distPx(landmarks[193], landmarks[417], videoWidth, videoHeight) / cosYaw) * mmPerPx;
  const rawNasalLengthMm = (distPx(landmarks[168], landmarks[2], videoWidth, videoHeight) / cosPitch) * mmPerPx;

  const cheekWidthPx = distPx(landmarks[234], landmarks[454], videoWidth, videoHeight) / cosYaw;
  const jawWidthPx = distPx(landmarks[172], landmarks[397], videoWidth, videoHeight) / cosYaw;
  const lowerJawWidthPx = distPx(landmarks[149], landmarks[378], videoWidth, videoHeight) / cosYaw;
  const foreheadWidthPx = distPx(landmarks[54], landmarks[284], videoWidth, videoHeight) / cosYaw;

  const leftJawCurvePx = polylineLengthPx(
    landmarks,
    LEFT_JAWLINE_INDICES,
    videoWidth,
    videoHeight
  );
  const rightJawCurvePx = polylineLengthPx(
    landmarks,
    RIGHT_JAWLINE_INDICES,
    videoWidth,
    videoHeight
  );
  const jawlineLengthPx = ((leftJawCurvePx + rightJawCurvePx) / 2) / ((cosYaw + cosPitch) * 0.5);

  // MediaPipe landmark 10 stops below hairline; add 0.44 * forehead segment (10->168) for anatomical face height
  const meshLengthPx = distPx(landmarks[10], landmarks[152], videoWidth, videoHeight);
  const upperForeheadAdjPx = distPx(landmarks[10], landmarks[168], videoWidth, videoHeight) * 0.44;
  const anatLengthPx = (meshLengthPx + upperForeheadAdjPx) / cosPitch;

  const rawFaceWidthMm = cheekWidthPx * mmPerPx;
  const rawJawWidthMm = jawWidthPx * mmPerPx;
  const rawJawlineLengthMm = jawlineLengthPx * mmPerPx;
  const rawForeheadWidthMm = foreheadWidthPx * mmPerPx;
  const rawFaceLengthMm = anatLengthPx * mmPerPx;

  const leftJawAngle = angleDegAtVertex(
    landmarks[234],
    landmarks[172],
    landmarks[152],
    videoWidth,
    videoHeight
  );
  const rightJawAngle = angleDegAtVertex(
    landmarks[454],
    landmarks[397],
    landmarks[152],
    videoWidth,
    videoHeight
  );
  const jawAngleDeg = (leftJawAngle + rightJawAngle) / 2;

  const eyeDistanceMm = Number(Math.max(52, Math.min(75, rawEyeDistanceMm)).toFixed(1));
  const nasalWidthMm = Number(Math.max(14, Math.min(26, rawNasalWidthMm)).toFixed(1));
  const nasalLengthMm = Number(Math.max(38, Math.min(62, rawNasalLengthMm)).toFixed(1));
  const faceWidthMm = Number(Math.max(115, Math.min(168, rawFaceWidthMm)).toFixed(1));
  const jawWidthMm = Number(Math.max(92, Math.min(148, rawJawWidthMm)).toFixed(1));
  const jawlineLengthMm = Number(Math.max(76, Math.min(138, rawJawlineLengthMm)).toFixed(1));
  const foreheadWidthMm = Number(Math.max(98, Math.min(152, rawForeheadWidthMm)).toFixed(1));
  const faceLengthMm = Number(Math.max(145, Math.min(230, rawFaceLengthMm)).toFixed(1));

  // Classify on un-clamped, pose-adjusted geometric proportions across all 5 primary facial measurements
  const faceShape = classifyFaceShape({
    aspect: anatLengthPx / Math.max(1, cheekWidthPx),
    foreheadRatio: foreheadWidthPx / Math.max(1, cheekWidthPx),
    jawRatio: jawWidthPx / Math.max(1, cheekWidthPx),
    jawlineLengthRatio: jawlineLengthPx / Math.max(1, cheekWidthPx),
    foreheadVsJaw: foreheadWidthPx / Math.max(1, jawWidthPx),
    chinTaper: lowerJawWidthPx / Math.max(1, jawWidthPx),
    jawAngleDeg,
  });

  let guidanceHint: string | null = null;
  if (meanLuma < 44) {
    guidanceHint = 'More light needed';
  } else if (faceBoxWidthFrac < 0.2) {
    guidanceHint = 'Move closer';
  } else if (faceBoxWidthFrac > 0.68) {
    guidanceHint = 'Move farther';
  } else if (Math.abs(yawDeg) > 16 || Math.abs(pitchDeg) > 16 || Math.abs(rollDeg) > 14) {
    guidanceHint = 'Look straight';
  }

  return {
    eyeDistanceMm,
    nasalWidthMm,
    nasalLengthMm,
    faceWidthMm,
    cheekboneWidthMm: faceWidthMm,
    jawWidthMm,
    jawlineWidthMm: jawWidthMm,
    jawlineLengthMm,
    foreheadWidthMm,
    faceLengthMm,
    yawDeg,
    pitchDeg,
    rollDeg,
    faceShape,
    jawlineProfile: JAWLINE_PROFILES[faceShape],
    guidanceHint,
    minX,
    minY,
    maxX,
    maxY,
  };
}

// Compute average luminance from central region of video via small scratch canvas
export function estimateFrameLuminance(
  video: HTMLVideoElement,
  scratchCtx: CanvasRenderingContext2D,
  w = 64,
  h = 36
): number {
  if (video.readyState < 2) return 128;
  scratchCtx.drawImage(video, 0, 0, w, h);
  const img = scratchCtx.getImageData(0, 0, w, h).data;
  let sum = 0;
  let count = 0;
  // Focus on central 60% where user stands
  const x0 = Math.floor(w * 0.2);
  const x1 = Math.floor(w * 0.8);
  const y0 = Math.floor(h * 0.15);
  const y1 = Math.floor(h * 0.85);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * w + x) * 4;
      sum += 0.299 * img[idx] + 0.587 * img[idx + 1] + 0.114 * img[idx + 2];
      count++;
    }
  }
  return count > 0 ? sum / count : 128;
}

// ---------- Slide 13 (PDF Page 16) Golden-Ratio Mesh & Background-Free Pencil-Sketch ----------
export function drawGoldenRatioAndMeshOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmarkPoint[] | undefined,
  drawW: number,
  drawH: number,
  offX: number,
  offY: number
): void {
  if (!landmarks || landmarks.length < 468) return;

  const toPx = (idx: number) => ({
    x: offX + landmarks[idx].x * drawW,
    y: offY + landmarks[idx].y * drawH,
  });

  // Anatomical polygonal wireframe facets matching the geometric loading preview
  const meshEdges: Array<[number, number]> = [
    // Forehead & brow facets
    [10, 109], [10, 338], [10, 168], [109, 67], [67, 103], [103, 54], [54, 21],
    [338, 297], [297, 332], [332, 284], [284, 251],
    [54, 70], [284, 300], [70, 63], [63, 105], [105, 66], [66, 107], [107, 168],
    [300, 293], [293, 334], [334, 296], [296, 336], [336, 168],
    [109, 105], [338, 334], [67, 63], [297, 293],
    // Temple / cheek triangulation
    [21, 162], [162, 127], [127, 234], [234, 93], [93, 132], [132, 58], [58, 172],
    [251, 389], [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397],
    [33, 127], [33, 234], [263, 356], [263, 454],
    [133, 168], [362, 168], [133, 193], [362, 417],
    [234, 50], [50, 205], [205, 2], [234, 172], [50, 132],
    [454, 280], [280, 425], [425, 2], [454, 397], [280, 361],
    // Jawline & chin facets
    [172, 136], [136, 150], [150, 149], [149, 176], [176, 148], [148, 152],
    [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152],
    [61, 172], [61, 149], [291, 397], [291, 378], [61, 291], [17, 152], [2, 17],
    [205, 61], [425, 291], [50, 172], [280, 397],
    // Forehead / cheekbone / jawline horizontal & vertical calipers
    [54, 284], [234, 454], [172, 397],
  ];

  ctx.save();
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.52)';
  ctx.lineWidth = 1.25;
  ctx.setLineDash([4, 2]);
  for (const [ia, ib] of meshEdges) {
    const pa = landmarks[ia];
    const pb = landmarks[ib];
    if (!pa || !pb) continue;
    const ax = offX + pa.x * drawW;
    const ay = offY + pa.y * drawH;
    const bx = offX + pb.x * drawW;
    const by = offY + pb.y * drawH;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // Soft wireframe contours matching concept art aesthetic
  ctx.strokeStyle = 'rgba(23, 107, 168, 0.62)';
  ctx.lineWidth = 1.7;
  ctx.setLineDash([5, 3]);

  // Face oval wireframe
  ctx.beginPath();
  FACE_OVAL_INDICES.forEach((idx, i) => {
    const p = toPx(idx);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.stroke();

  // Eyes wireframe
  for (const loop of [LEFT_EYE_CONTOUR, RIGHT_EYE_CONTOUR]) {
    ctx.beginPath();
    loop.forEach((idx, i) => {
      const p = toPx(idx);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  // Nose wireframe
  ctx.beginPath();
  NOSE_OUTLINE_INDICES.forEach((idx, i) => {
    const p = toPx(idx);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // Golden-Ratio Proportions (vertical midline, inter-pupillary axis, brow/pupil/subnasale/menton divisions)
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = 'rgba(59, 190, 255, 0.9)';
  ctx.lineWidth = 2;

  const topHead = toPx(10);
  const chin = toPx(152);
  const leftCheek = toPx(234);
  const rightCheek = toPx(454);
  const leftIris = toPx(LEFT_IRIS_CENTER);
  const rightIris = toPx(RIGHT_IRIS_CENTER);
  const noseBase = toPx(2);
  const browCenter = toPx(168);

  // Vertical facial axis (Face Length)
  ctx.beginPath();
  ctx.moveTo(topHead.x, topHead.y - 16);
  ctx.lineTo(chin.x, chin.y + 16);
  ctx.stroke();

  // Horizontal golden ratio divisions
  const horizontalAnchors = [
    browCenter.y,
    (leftIris.y + rightIris.y) / 2,
    noseBase.y,
    chin.y,
  ];
  horizontalAnchors.forEach((hy) => {
    ctx.beginPath();
    ctx.moveTo(leftCheek.x - 18, hy);
    ctx.lineTo(rightCheek.x + 18, hy);
    ctx.stroke();
  });

  // Inter-pupillary golden caliper line
  ctx.setLineDash([]);
  ctx.strokeStyle = '#176BA8';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(leftIris.x, leftIris.y);
  ctx.lineTo(rightIris.x, rightIris.y);
  ctx.stroke();

  // Highlight key golden-ratio vertices
  ctx.fillStyle = '#3BBEFF';
  for (const pt of [
    topHead,
    chin,
    leftCheek,
    rightCheek,
    leftIris,
    rightIris,
    browCenter,
    noseBase,
  ]) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export interface SketchFaceAsset {
  sketchFaceDataUrl: string;
  sketchWidth: number;
  sketchHeight: number;
  sketchLandmarks: NormalizedLandmarkPoint[];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Generates a background-free transparent PNG sketch of the user's scanned face/head:
 * 1) Crops generously around face/hair/jaw from captured front-facing photo.
 * 2) Segments foreground person via MediaPipe ImageSegmenter (selfie_segmenter.tflite),
 *    refined with FaceLandmarker face-oval + head-dome contour to keep face, hair & jaw while isolating background/torso.
 * 3) Applies pencil-sketch filter (grayscale -> invert -> Gaussian blur -> color-dodge + light Sobel edges).
 * 4) Applies soft 3px feathered mask so everything outside the head/face is 100% transparent.
 */
export async function generateBackgroundFreeSketch(
  scanResult: FacialScanResult
): Promise<SketchFaceAsset | null> {
  if (!scanResult.capturedPhotoDataUrl) return null;

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => resolve(null);
    el.src = scanResult.capturedPhotoDataUrl!;
  });
  if (!img || img.width < 10 || img.height < 10) return null;

  const lms = scanResult.capturedLandmarks;
  let rx0 = 0;
  let ry0 = 0;
  let rx1 = 1;
  let ry1 = 1;

  if (lms && lms.length >= 468) {
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const p of lms) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const spanX = Math.max(0.1, maxX - minX);
    const spanY = Math.max(0.1, maxY - minY);
    rx0 = Math.max(0, minX - spanX * 0.48);
    rx1 = Math.min(1, maxX + spanX * 0.48);
    ry0 = Math.max(0, minY - spanY * 0.56); // Extra headroom for hair/crown
    ry1 = Math.min(1, maxY + spanY * 0.22); // Clean jaw/chin without shoulders
  }

  const sx = rx0 * img.width;
  const sy = ry0 * img.height;
  const sw = Math.max(60, (rx1 - rx0) * img.width);
  const sh = Math.max(60, (ry1 - ry0) * img.height);

  const maxOutW = 500;
  const maxOutH = 620;
  const fitScale = Math.min(maxOutW / sw, maxOutH / sh);
  const workW = Math.max(120, Math.round(sw * fitScale));
  const workH = Math.max(140, Math.round(sh * fitScale));

  // Mapped landmarks in cropped [0..1] canvas coordinates
  const rSpanX = Math.max(0.01, rx1 - rx0);
  const rSpanY = Math.max(0.01, ry1 - ry0);
  const sketchLandmarks: NormalizedLandmarkPoint[] = lms
    ? lms.map((p) => ({
        x: (p.x - rx0) / rSpanX,
        y: (p.y - ry0) / rSpanY,
        z: p.z,
      }))
    : [];

  // Working cropped color canvas
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = workW;
  cropCanvas.height = workH;
  const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
  if (!cropCtx) return null;
  cropCtx.drawImage(img, sx, sy, sw, sh, 0, 0, workW, workH);

  // Step 2: Run MediaPipe ImageSegmenter (selfie_segmenter) on cropped photo
  let segMaskFloat: Float32Array | null = null;
  let segW = workW;
  let segH = workH;
  try {
    const segmenter = await getImageSegmenter();
    const segResult = runWithFilteredMediaPipeInfo(() => segmenter.segment(cropCanvas));
    const masks = segResult.confidenceMasks;
    const confMask = masks && masks.length > 1 ? masks[1] : masks?.[0];
    if (confMask) {
      segW = confMask.width;
      segH = confMask.height;
      // Copy immediately before closing result
      segMaskFloat = new Float32Array(confMask.getAsFloat32Array());
    }
    segResult.close();
  } catch {
    segMaskFloat = null;
  }

  // Build Landmark Face-Oval Core Mask + Soft Head/Hair Silhouette Gate
  const faceCoreCanvas = document.createElement('canvas');
  faceCoreCanvas.width = workW;
  faceCoreCanvas.height = workH;
  const faceCoreCtx = faceCoreCanvas.getContext('2d', { willReadFrequently: true })!;

  const headGateCanvas = document.createElement('canvas');
  headGateCanvas.width = workW;
  headGateCanvas.height = workH;
  const headGateCtx = headGateCanvas.getContext('2d', { willReadFrequently: true })!;

  if (sketchLandmarks.length >= 468) {
    // Inner face oval (never gets dropped out)
    faceCoreCtx.fillStyle = '#FFFFFF';
    faceCoreCtx.beginPath();
    FACE_OVAL_INDICES.forEach((idx, i) => {
      const px = sketchLandmarks[idx].x * workW;
      const py = sketchLandmarks[idx].y * workH;
      if (i === 0) faceCoreCtx.moveTo(px, py);
      else faceCoreCtx.lineTo(px, py);
    });
    faceCoreCtx.closePath();
    faceCoreCtx.fill();

    // Soft head+hair gate around face oval so shoulders/desk edges stay excluded
    let fMinX = 1;
    let fMaxX = 0;
    let fMinY = 1;
    let fMaxY = 0;
    for (const idx of FACE_OVAL_INDICES) {
      const p = sketchLandmarks[idx];
      if (p.x < fMinX) fMinX = p.x;
      if (p.x > fMaxX) fMaxX = p.x;
      if (p.y < fMinY) fMinY = p.y;
      if (p.y > fMaxY) fMaxY = p.y;
    }
    const fW = (fMaxX - fMinX) * workW;
    const fH = (fMaxY - fMinY) * workH;
    const headCx = ((fMinX + fMaxX) / 2) * workW;
    const headCy = (fMinY + (fMaxY - fMinY) * 0.42) * workH;

    headGateCtx.save();
    headGateCtx.filter = 'blur(14px)';
    headGateCtx.fillStyle = '#FFFFFF';
    headGateCtx.beginPath();
    headGateCtx.ellipse(headCx, headCy, fW * 0.88, fH * 0.84, 0, 0, Math.PI * 2);
    headGateCtx.fill();
    headGateCtx.restore();
  } else {
    faceCoreCtx.fillStyle = '#FFFFFF';
    faceCoreCtx.beginPath();
    faceCoreCtx.ellipse(workW / 2, workH * 0.48, workW * 0.34, workH * 0.4, 0, 0, Math.PI * 2);
    faceCoreCtx.fill();

    headGateCtx.fillStyle = '#FFFFFF';
    headGateCtx.beginPath();
    headGateCtx.ellipse(workW / 2, workH * 0.46, workW * 0.46, workH * 0.46, 0, 0, Math.PI * 2);
    headGateCtx.fill();
  }

  const coreData = faceCoreCtx.getImageData(0, 0, workW, workH).data;
  const gateData = headGateCtx.getImageData(0, 0, workW, workH).data;

  // Raw refined mask canvas before 3px feather blur
  const rawMaskCanvas = document.createElement('canvas');
  rawMaskCanvas.width = workW;
  rawMaskCanvas.height = workH;
  const rawMaskCtx = rawMaskCanvas.getContext('2d')!;
  const rawMaskImg = rawMaskCtx.createImageData(workW, workH);
  const mPx = rawMaskImg.data;

  const bottomFadeStart = workH * 0.91;
  for (let y = 0; y < workH; y++) {
    const syIdx = Math.min(segH - 1, Math.floor((y / workH) * segH));
    const bottomFade = y > bottomFadeStart ? smoothstep(workH, bottomFadeStart, y) : 1;
    for (let x = 0; x < workW; x++) {
      const idx = (y * workW + x) * 4;
      const coreAlpha = coreData[idx] / 255;
      const gateAlpha = gateData[idx] / 255;

      let fgAlpha: number;
      if (segMaskFloat) {
        const sxIdx = Math.min(segW - 1, Math.floor((x / workW) * segW));
        const conf = segMaskFloat[syIdx * segW + sxIdx];
        const segWeight = smoothstep(0.26, 0.72, conf);
        // Refine: combine MediaPipe segmentation confidence with head-dome gate, and preserve core face oval
        fgAlpha = Math.max(coreAlpha * 0.98, segWeight * gateAlpha);
      } else {
        fgAlpha = Math.max(coreAlpha, gateAlpha * 0.85);
      }

      const byteA = Math.round(Math.max(0, Math.min(1, fgAlpha * bottomFade)) * 255);
      mPx[idx] = 255;
      mPx[idx + 1] = 255;
      mPx[idx + 2] = 255;
      mPx[idx + 3] = byteA;
    }
  }
  rawMaskCtx.putImageData(rawMaskImg, 0, 0);

  // Soft 3px feathered mask (satisfies 2-4 px feathering requirement)
  const featherMaskCanvas = document.createElement('canvas');
  featherMaskCanvas.width = workW;
  featherMaskCanvas.height = workH;
  const featherCtx = featherMaskCanvas.getContext('2d')!;
  featherCtx.filter = 'blur(3px)';
  featherCtx.drawImage(rawMaskCanvas, 0, 0);
  featherCtx.filter = 'none';

  // Step 3: Pencil-sketch filter (grayscale -> invert -> Gaussian blur -> color-dodge + light edge detection)
  const grayCanvas = document.createElement('canvas');
  grayCanvas.width = workW;
  grayCanvas.height = workH;
  const gCtx = grayCanvas.getContext('2d', { willReadFrequently: true })!;
  gCtx.fillStyle = '#FFFFFF';
  gCtx.fillRect(0, 0, workW, workH);
  gCtx.filter = 'grayscale(100%) contrast(124%) brightness(102%)';
  gCtx.drawImage(cropCanvas, 0, 0);
  gCtx.filter = 'none';
  const grayImgData = gCtx.getImageData(0, 0, workW, workH).data;

  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = workW;
  blurCanvas.height = workH;
  const bCtx = blurCanvas.getContext('2d')!;
  bCtx.fillStyle = '#000000';
  bCtx.fillRect(0, 0, workW, workH);
  bCtx.filter = 'grayscale(100%) invert(100%) blur(8px)';
  bCtx.drawImage(cropCanvas, 0, 0);
  bCtx.filter = 'none';

  const sketchCanvas = document.createElement('canvas');
  sketchCanvas.width = workW;
  sketchCanvas.height = workH;
  const sCtx = sketchCanvas.getContext('2d', { willReadFrequently: true })!;
  sCtx.drawImage(grayCanvas, 0, 0);
  sCtx.globalCompositeOperation = 'color-dodge';
  sCtx.drawImage(blurCanvas, 0, 0);
  sCtx.globalCompositeOperation = 'source-over';

  // Light Sobel edge detection + rich pencil tonal shading on segmented head silhouette
  const dodgeFrame = sCtx.getImageData(0, 0, workW, workH);
  const px = dodgeFrame.data;

  const lumAt = (pxX: number, pxY: number) => {
    const cx = Math.max(0, Math.min(workW - 1, pxX));
    const cy = Math.max(0, Math.min(workH - 1, pxY));
    return grayImgData[(cy * workW + cx) * 4];
  };

  for (let y = 0; y < workH; y++) {
    for (let x = 0; x < workW; x++) {
      const idx = (y * workW + x) * 4;
      const dodgeLum = (px[idx] + px[idx + 1] + px[idx + 2]) / 3;
      const grayLum = grayImgData[idx];

      // Light Sobel 3x3 gradient magnitude
      const gx =
        -lumAt(x - 1, y - 1) +
        lumAt(x + 1, y - 1) -
        2 * lumAt(x - 1, y) +
        2 * lumAt(x + 1, y) -
        lumAt(x - 1, y + 1) +
        lumAt(x + 1, y + 1);
      const gy =
        -lumAt(x - 1, y - 1) -
        2 * lumAt(x, y - 1) -
        lumAt(x + 1, y - 1) +
        lumAt(x - 1, y + 1) +
        2 * lumAt(x, y + 1) +
        lumAt(x + 1, y + 1);
      const edgeMag = Math.min(255, Math.hypot(gx, gy) * 0.28);

      // Combine color-dodge linework with soft grayscale portrait shading & crisp edges
      const blended = Math.max(0, Math.min(255, dodgeLum * 0.7 + grayLum * 0.3 - edgeMag * 0.56));
      // Slight gamma deepens pencil strokes & facial midtones while preserving bright paper highlights
      const tone = Math.pow(blended / 255, 1.18);

      // Rich graphite charcoal (#12253A) to clean soft sketch paper (#F6FAFE)
      px[idx] = Math.round(18 + tone * 228);
      px[idx + 1] = Math.round(37 + tone * 213);
      px[idx + 2] = Math.round(58 + tone * 196);
      px[idx + 3] = 255;
    }
  }
  sCtx.putImageData(dodgeFrame, 0, 0);

  // Step 4: Apply 3px feathered segmentation mask so background outside face/head is 100% transparent
  sCtx.globalCompositeOperation = 'destination-in';
  sCtx.drawImage(featherMaskCanvas, 0, 0);
  sCtx.globalCompositeOperation = 'source-over';

  return {
    sketchFaceDataUrl: sketchCanvas.toDataURL('image/png'),
    sketchWidth: workW,
    sketchHeight: workH,
    sketchLandmarks,
  };
}

export function renderPencilSketchWithGoldenRatio(
  canvas: HTMLCanvasElement,
  scanResult: FacialScanResult
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const targetW = canvas.width;
  const targetH = canvas.height;
  ctx.clearRect(0, 0, targetW, targetH);

  const drawFromSketchUrl = (
    url: string,
    landmarks: NormalizedLandmarkPoint[] | undefined
  ) => {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, targetW, targetH);
      const scale = Math.min(targetW / img.width, targetH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const offX = (targetW - drawW) / 2;
      const offY = (targetH - drawH) / 2;
      ctx.drawImage(img, offX, offY, drawW, drawH);
      drawGoldenRatioAndMeshOverlay(ctx, landmarks, drawW, drawH, offX, offY);
    };
    img.src = url;
  };

  if (scanResult.sketchFaceDataUrl) {
    drawFromSketchUrl(
      scanResult.sketchFaceDataUrl,
      scanResult.sketchLandmarks || scanResult.capturedLandmarks
    );
    return;
  }

  if (!scanResult.capturedPhotoDataUrl) {
    drawGoldenRatioAndMeshOverlay(
      ctx,
      scanResult.capturedLandmarks,
      targetW * 0.8,
      targetH * 0.8,
      targetW * 0.1,
      targetH * 0.1
    );
    return;
  }

  void generateBackgroundFreeSketch(scanResult).then((asset) => {
    if (asset) {
      drawFromSketchUrl(asset.sketchFaceDataUrl, asset.sketchLandmarks);
    }
  });
}
