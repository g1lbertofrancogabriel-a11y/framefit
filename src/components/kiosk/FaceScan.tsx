import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { FacialScanResult, NormalizedLandmarkPoint } from '../../types/framefit';
import { audioEngine } from '../../utils/audioEngine';
import {
  computeLiveFaceMetrics,
  estimateFrameLuminance,
  FACE_OVAL_INDICES,
  generateBackgroundFreeSketch,
  getFaceLandmarker,
  getImageSegmenter,
  LANDMARK_MEASUREMENT_DOTS,
  LandmarkSmoother,
  LEFT_EYE_CONTOUR,
  LEFT_IRIS_CENTER,
  LEFT_JAWLINE_INDICES,
  LiveFaceMetrics,
  NOSE_OUTLINE_INDICES,
  RIGHT_EYE_CONTOUR,
  RIGHT_IRIS_CENTER,
  RIGHT_JAWLINE_INDICES,
  runWithFilteredMediaPipeInfo,
  selectNearestFace,
  SketchFaceAsset,
} from '../../utils/faceAnalytics';
import {
  FaceShapeChip,
  HalftoneDots,
  KioskHeader,
  ProceedButton,
  ReturnButton,
} from '../shared/BrandLogo';

export type FaceScanStage = 1 | 2 | 3 | 4 | 5;

export interface FaceScanProps {
  customerName?: string;
  onReturn: () => void;
  onComplete: (scanResult: FacialScanResult) => void;
  onStageCue?: (stage: FaceScanStage) => void;
  onStageSpeech?: (
    text: string,
    options?: { minRepeatCooldownMs?: number }
  ) => Promise<void>;
}

function easeOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export const FaceScan: React.FC<FaceScanProps> = ({
  onReturn,
  onComplete,
  onStageCue,
  onStageSpeech,
}) => {
  const [stage, setStage] = useState<FaceScanStage>(1);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [guidanceHint, setGuidanceHint] = useState<string | null>(null);
  const [sampleProgress, setSampleProgress] = useState(0); // 0..30
  const [liveReadout, setLiveReadout] = useState<{
    eyeDistanceMm: number;
    nasalWidthMm: number;
    faceWidthMm: number;
    foreheadWidthMm: number;
    cheekboneWidthMm: number;
    jawlineLengthMm: number;
    jawlineWidthMm: number;
    faceLengthMm: number;
    faceShape: FacialScanResult['faceShape'];
    jawlineProfile: string;
  }>({
    eyeDistanceMm: 62.5,
    nasalWidthMm: 18.2,
    faceWidthMm: 136.0,
    foreheadWidthMm: 121.0,
    cheekboneWidthMm: 136.0,
    jawlineLengthMm: 104.5,
    jawlineWidthMm: 112.0,
    faceLengthMm: 182.0,
    faceShape: 'Oval',
    jawlineProfile: 'Balanced & Soft Contour',
  });
  const [finalScanResult, setFinalScanResult] = useState<FacialScanResult | null>(null);
  const [autoProceedSecs, setAutoProceedSecs] = useState<number | null>(null);

  // Stage 5 animated count-up display values
  const [countDisplay, setCountDisplay] = useState({
    eyeDistanceMm: 0,
    nasalWidthMm: 0,
    faceWidthMm: 0,
    foreheadWidthMm: 0,
    cheekboneWidthMm: 0,
    jawlineLengthMm: 0,
    jawlineWidthMm: 0,
    faceLengthMm: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniSketchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const lastDetectTsRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);
  const initTokenRef = useRef<number>(0);

  // Mutable animation & tracking state for smooth 60fps loop without re-renders
  const stageRef = useRef<FaceScanStage>(1);
  const stageEnteredAtRef = useRef<number>(performance.now());
  const lockedFaceCenterRef = useRef<{ cx: number; cy: number; area: number } | null>(null);
  const smootherRef = useRef(new LandmarkSmoother());
  const latestLandmarksRef = useRef<NormalizedLandmarkPoint[] | null>(null);
  const latestMetricsRef = useRef<LiveFaceMetrics | null>(null);

  // Accumulated 30+ steady front-facing measurement samples
  const samplesRef = useRef<LiveFaceMetrics[]>([]);
  const bestFrameSnapshotRef = useRef<{
    sharpnessScore: number;
    photoDataUrl: string;
    width: number;
    height: number;
    landmarks: NormalizedLandmarkPoint[];
  } | null>(null);

  // Bounding box interpolation for Stage 2->3->4 transitions
  const activeBoxRef = useRef({ minX: 0.41, minY: 0.35, maxX: 0.59, maxY: 0.65 });
  const stage1FaceFramesRef = useRef(0);
  const spokenStagesRef = useRef<Set<FaceScanStage>>(new Set());
  const lastScanVoiceAtRef = useRef<number>(0);
  const finalScanResultRef = useRef<FacialScanResult | null>(null);
  const sketchPromiseRef = useRef<Promise<SketchFaceAsset | null> | null>(null);
  const hasCompletedRef = useRef<boolean>(false);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const transitionStage = useCallback((nextStage: FaceScanStage) => {
    if (stageRef.current === nextStage) return;
    stageRef.current = nextStage;
    stageEnteredAtRef.current = performance.now();
    setStage(nextStage);
  }, []);

  // Start Camera + Load MediaPipe FaceLandmarker
  const startCamera = useCallback(async () => {
    const token = ++initTokenRef.current;
    setCameraError(null);
    setModelReady(false);
    stopCameraStream();
    samplesRef.current = [];
    bestFrameSnapshotRef.current = null;
    stage1FaceFramesRef.current = 0;
    lockedFaceCenterRef.current = null;
    latestLandmarksRef.current = null;
    latestMetricsRef.current = null;
    spokenStagesRef.current.clear();
    lastScanVoiceAtRef.current = 0;
    finalScanResultRef.current = null;
    sketchPromiseRef.current = null;
    hasCompletedRef.current = false;
    smootherRef.current.reset();
    setSampleProgress(0);
    setFinalScanResult(null);
    setAutoProceedSecs(null);
    transitionStage(1);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported in this browser environment.');
      return;
    }

    try {
      const [stream, landmarker] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        }),
        getFaceLandmarker(),
      ]);
      // Pre-warm MediaPipe ImageSegmenter in background so sketch generation is instant at Scan Complete
      void getImageSegmenter().catch(() => {});

      // Guard against unmount or superseded retry while permissions/WASM were loading
      if (!mountedRef.current || token !== initTokenRef.current) {
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            // ignore
          }
        });
        return;
      }

      streamRef.current = stream;
      landmarkerRef.current = landmarker;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      if (mountedRef.current && token === initTokenRef.current) {
        setModelReady(true);
      }
    } catch (err) {
      if (!mountedRef.current || token !== initTokenRef.current) return;
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access to run the AR facial scan.'
          : 'Unable to access camera device or load 3D facial tracker. Please check your webcam connection and retry.';
      setCameraError(msg);
    }
  }, [stopCameraStream, transitionStage]);

  useEffect(() => {
    mountedRef.current = true;
    void startCamera();
    return () => {
      mountedRef.current = false;
      initTokenRef.current += 1;
      stopCameraStream();
      audioEngine.clearVoiceQueue();
    };
  }, [startCamera, stopCameraStream]);

  // Helper: capture mirrored un-overlaid frame & mirrored landmarks into session snapshot
  const captureCleanSnapshot = useCallback(
    (
      video: HTMLVideoElement,
      landmarks: NormalizedLandmarkPoint[],
      metrics: LiveFaceMetrics
    ) => {
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      if (!snapshotCanvasRef.current) {
        snapshotCanvasRef.current = document.createElement('canvas');
      }
      const capCanvas = snapshotCanvasRef.current;
      capCanvas.width = vw;
      capCanvas.height = vh;
      const cCtx = capCanvas.getContext('2d');
      if (!cCtx) return;

      // Mirror horizontally to match selfie orientation
      cCtx.save();
      cCtx.translate(vw, 0);
      cCtx.scale(-1, 1);
      cCtx.drawImage(video, 0, 0, vw, vh);
      cCtx.restore();

      const frontFacingScore =
        100 -
        Math.abs(metrics.yawDeg) * 2.5 -
        Math.abs(metrics.pitchDeg) * 2.5 -
        Math.abs(metrics.rollDeg) * 2;

      const existing = bestFrameSnapshotRef.current;
      if (!existing || frontFacingScore >= existing.sharpnessScore) {
        bestFrameSnapshotRef.current = {
          sharpnessScore: frontFacingScore,
          photoDataUrl: capCanvas.toDataURL('image/jpeg', 0.9),
          width: vw,
          height: vh,
          landmarks: landmarks.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
        };
      }
    },
    []
  );

  // Build averaged FacialScanResult once scan completes (Stage 5)
  const finalizeScanData = useCallback((): FacialScanResult => {
    const list = samplesRef.current;
    const count = Math.max(1, list.length);
    const avg = (pick: (m: LiveFaceMetrics) => number) =>
      Number((list.reduce((s, m) => s + pick(m), 0) / count).toFixed(1));

    // Majority-vote face shape across steady frames
    const shapeVotes = new Map<FacialScanResult['faceShape'], number>();
    for (const m of list) {
      shapeVotes.set(m.faceShape, (shapeVotes.get(m.faceShape) || 0) + 1);
    }
    let bestShape: FacialScanResult['faceShape'] = liveReadout.faceShape;
    let bestVotes = -1;
    for (const [sh, v] of shapeVotes.entries()) {
      if (v > bestVotes) {
        bestVotes = v;
        bestShape = sh;
      }
    }

    const latestM = latestMetricsRef.current;
    const snap = bestFrameSnapshotRef.current;

    const eyeDistanceMm = list.length ? avg((m) => m.eyeDistanceMm) : liveReadout.eyeDistanceMm;
    const nasalWidthMm = list.length ? avg((m) => m.nasalWidthMm) : liveReadout.nasalWidthMm;
    const nasalLengthMm = list.length ? avg((m) => m.nasalLengthMm) : latestM?.nasalLengthMm || 48.0;
    const faceWidthMm = list.length ? avg((m) => m.faceWidthMm) : liveReadout.faceWidthMm;
    const cheekboneWidthMm = list.length
      ? avg((m) => m.cheekboneWidthMm)
      : liveReadout.cheekboneWidthMm;
    const jawWidthMm = list.length ? avg((m) => m.jawWidthMm) : liveReadout.jawlineWidthMm;
    const jawlineLengthMm = list.length
      ? avg((m) => m.jawlineLengthMm)
      : liveReadout.jawlineLengthMm;
    const foreheadWidthMm = list.length
      ? avg((m) => m.foreheadWidthMm)
      : liveReadout.foreheadWidthMm;
    const faceLengthMm = list.length ? avg((m) => m.faceLengthMm) : liveReadout.faceLengthMm;

    return {
      faceShape: bestShape,
      eyeDistanceMm,
      nasalWidthMm,
      nasalLengthMm,
      faceWidthMm,
      cheekboneWidthMm,
      jawWidthMm,
      jawlineWidthMm: jawWidthMm,
      jawlineLengthMm,
      foreheadWidthMm,
      faceLengthMm,
      jawlineProfile: latestM?.jawlineProfile || liveReadout.jawlineProfile,
      capturedPhotoDataUrl: snap?.photoDataUrl,
      capturedWidth: snap?.width,
      capturedHeight: snap?.height,
      capturedLandmarks: snap?.landmarks,
    };
  }, [liveReadout]);

  const finalizeScanDataRef = useRef(finalizeScanData);
  finalizeScanDataRef.current = finalizeScanData;
  const onStageCueRef = useRef(onStageCue);
  onStageCueRef.current = onStageCue;
  const onStageSpeechRef = useRef(onStageSpeech);
  onStageSpeechRef.current = onStageSpeech;
  const liveFaceShapeRef = useRef(liveReadout.faceShape);
  liveFaceShapeRef.current = liveReadout.faceShape;

  // Audio + Stage Sequencing Effects (runs strictly ONCE per stage transition)
  useEffect(() => {
    if (cameraError) return;
    let timerA: number | undefined;
    let timerB: number | undefined;
    let sfxSlideTimer: number | undefined;
    let sfxFlickerTimer: number | undefined;
    let cancelled = false;

    const alreadyTriggered = spokenStagesRef.current.has(stage);
    spokenStagesRef.current.add(stage);

    const speakLine = (phrase: string, cooldownMs = 60000) => {
      lastScanVoiceAtRef.current = performance.now();
      const opts = { minRepeatCooldownMs: cooldownMs };
      return onStageSpeechRef.current
        ? onStageSpeechRef.current(phrase, opts)
        : audioEngine.speak(phrase, opts);
    };

    if (!alreadyTriggered) {
      onStageCueRef.current?.(stage);
    }

    if (stage === 1) {
      if (!alreadyTriggered) {
        timerA = window.setTimeout(() => {
          if (!cancelled && stageRef.current === 1) {
            void speakLine('Looking for your face now...');
          }
        }, 450);
      }
    } else if (stage === 2) {
      // Immediate light ding upon face detection
      if (!alreadyTriggered && !onStageCueRef.current) {
        audioEngine.playLightDing();
      }
      // Calm pause before confirming face lock, then move to Measuring
      timerA = window.setTimeout(() => {
        if (cancelled || stageRef.current !== 2) return;
        void speakLine('Great, I see you! Hold steady for a moment.').then(() => {
          if (!cancelled && stageRef.current === 2) {
            timerB = window.setTimeout(() => {
              if (!cancelled && stageRef.current === 2) transitionStage(3);
            }, 1500);
          }
        });
      }, 3600);
    } else if (stage === 3) {
      if (!alreadyTriggered) {
        timerA = window.setTimeout(() => {
          if (cancelled || stageRef.current !== 3) return;
          if (performance.now() - lastScanVoiceAtRef.current >= 4500) {
            void speakLine('Measuring your facial proportions...');
          }
        }, 2000);
      }
    } else if (stage === 4) {
      if (!alreadyTriggered && performance.now() - lastScanVoiceAtRef.current >= 4500) {
        void speakLine('Tracing your face shape now...');
      }
      // Subtle realistic optical sweep SFX as the scan line slides top -> bottom (650ms..2150ms)
      sfxSlideTimer = window.setTimeout(() => {
        if (!cancelled && stageRef.current === 4) {
          audioEngine.playScanSlideSfx(1.42);
        }
      }, 650);
      // Subtle optical lock ticks synced to the 3 white flicker blinks (2150ms..3000ms)
      sfxFlickerTimer = window.setTimeout(() => {
        if (!cancelled && stageRef.current === 4) {
          audioEngine.playScanFlickerSfx();
        }
      }, 2150);

      // Stage 4 runs: 0-650ms contour trace, 650-2150ms top-to-bottom inner scan line, 2150-3000ms white flicker before determining face shape
      timerA = window.setTimeout(() => {
        if (!cancelled && stageRef.current === 4) {
          const result = finalizeScanDataRef.current();
          finalScanResultRef.current = result;
          setFinalScanResult(result);
          const task = generateBackgroundFreeSketch(result).then((asset) => {
            if (!cancelled && asset && mountedRef.current) {
              setFinalScanResult((prev) => {
                const updated = prev
                  ? {
                      ...prev,
                      sketchFaceDataUrl: asset.sketchFaceDataUrl,
                      sketchWidth: asset.sketchWidth,
                      sketchHeight: asset.sketchHeight,
                      sketchLandmarks: asset.sketchLandmarks,
                    }
                  : prev;
                finalScanResultRef.current = updated;
                return updated;
              });
            }
            return asset;
          });
          sketchPromiseRef.current = task;
          transitionStage(5);
        }
      }, 3050);
    } else if (stage === 5) {
      // Immediate two-note rising ding on scan complete
      if (!alreadyTriggered && !onStageCueRef.current) {
        audioEngine.playTwoNoteDing();
      }
      // Warm, humanized female AI announcement of the determined face shape
      if (!alreadyTriggered) {
        const detectedShape = finalScanResultRef.current?.faceShape ?? liveFaceShapeRef.current;
        const article = detectedShape === 'Oval' || detectedShape === 'Oblong' ? 'an' : 'a';
        timerA = window.setTimeout(() => {
          if (!cancelled && stageRef.current === 5) {
            void speakLine(
              `All done! It looks like you have ${article} ${detectedShape} face shape.`,
              0
            );
          }
        }, 900);
      }
    }

    return () => {
      cancelled = true;
      if (timerA) window.clearTimeout(timerA);
      if (timerB) window.clearTimeout(timerB);
      if (sfxSlideTimer) window.clearTimeout(sfxSlideTimer);
      if (sfxFlickerTimer) window.clearTimeout(sfxFlickerTimer);
    };
  }, [stage, cameraError, transitionStage]);

  const handleProceedComplete = useCallback(async () => {
    const result = finalScanResultRef.current;
    if (hasCompletedRef.current || !result) return;
    hasCompletedRef.current = true;
    stopCameraStream();
    if (!result.sketchFaceDataUrl && sketchPromiseRef.current) {
      const asset = await sketchPromiseRef.current.catch(() => null);
      if (asset) {
        onComplete({
          ...result,
          sketchFaceDataUrl: asset.sketchFaceDataUrl,
          sketchWidth: asset.sketchWidth,
          sketchHeight: asset.sketchHeight,
          sketchLandmarks: asset.sketchLandmarks,
        });
        return;
      }
    }
    onComplete(result);
  }, [stopCameraStream, onComplete]);

  // Stage 5: 30-second countdown before automatically proceeding
  useEffect(() => {
    if (stage !== 5 || !finalScanResult || cameraError) {
      setAutoProceedSecs(null);
      return;
    }

    setAutoProceedSecs(30);
    const interval = window.setInterval(() => {
      setAutoProceedSecs((prev) => {
        if (prev === null) return null;
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [stage, finalScanResult, cameraError]);

  useEffect(() => {
    if (stage === 5 && finalScanResult && autoProceedSecs === 0) {
      void handleProceedComplete();
    }
  }, [stage, finalScanResult, autoProceedSecs, handleProceedComplete]);

  // Stage 5 Result Numbers Count-Up & Mini Wireframe Sketch
  useEffect(() => {
    if (stage !== 5 || !finalScanResult) return;
    const start = performance.now();
    const dur = 750;
    let raf = 0;

    const tick = (now: number) => {
      const p = easeOutCubic((now - start) / dur);
      setCountDisplay({
        eyeDistanceMm: Number((finalScanResult.eyeDistanceMm * p).toFixed(1)),
        nasalWidthMm: Number((finalScanResult.nasalWidthMm * p).toFixed(1)),
        faceWidthMm: Number((finalScanResult.faceWidthMm * p).toFixed(1)),
        foreheadWidthMm: Number((finalScanResult.foreheadWidthMm * p).toFixed(1)),
        cheekboneWidthMm: Number((finalScanResult.cheekboneWidthMm * p).toFixed(1)),
        jawlineLengthMm: Number((finalScanResult.jawlineLengthMm * p).toFixed(1)),
        jawlineWidthMm: Number((finalScanResult.jawlineWidthMm * p).toFixed(1)),
        faceLengthMm: Number((finalScanResult.faceLengthMm * p).toFixed(1)),
      });
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);

    // Draw mini facial wireframe on left green panel
    const mini = miniSketchCanvasRef.current;
    if (mini && finalScanResult.capturedLandmarks) {
      const ctx = mini.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, mini.width, mini.height);
        const lms = finalScanResult.capturedLandmarks;
        let minX = 1;
        let maxX = 0;
        let minY = 1;
        let maxY = 0;
        for (const p of lms) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        const pad = 14;
        const spanX = Math.max(0.05, maxX - minX);
        const spanY = Math.max(0.05, maxY - minY);
        const scale = Math.min(
          (mini.width - pad * 2) / spanX,
          (mini.height - pad * 2) / spanY
        );
        const ox = (mini.width - spanX * scale) / 2;
        const oy = (mini.height - spanY * scale) / 2;
        const pt = (idx: number) => ({
          x: ox + (lms[idx].x - minX) * scale,
          y: oy + (lms[idx].y - minY) * scale,
        });

        ctx.strokeStyle = '#C8FF82';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([4, 3]);
        for (const loop of [
          FACE_OVAL_INDICES,
          LEFT_EYE_CONTOUR,
          RIGHT_EYE_CONTOUR,
          NOSE_OUTLINE_INDICES,
        ]) {
          ctx.beginPath();
          loop.forEach((idx, i) => {
            const p = pt(idx);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          if (loop !== NOSE_OUTLINE_INDICES) ctx.closePath();
          ctx.stroke();
        }
      }
    }

    return () => cancelAnimationFrame(raf);
  }, [stage, finalScanResult]);

  // Continuous Synchronous 60fps AR Tracking & Transparent Canvas Overlay Loop
  useEffect(() => {
    if (!modelReady || cameraError) return;
    let rafId = 0;
    let lastUiSync = 0;
    let lastVideoTime = -1;

    const lumaCanvas = document.createElement('canvas');
    lumaCanvas.width = 64;
    lumaCanvas.height = 36;
    const lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true });

    const renderLoop = (now: number) => {
      rafId = requestAnimationFrame(renderLoop);
      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      const landmarker = landmarkerRef.current;
      if (
        !video ||
        !canvas ||
        !landmarker ||
        video.readyState < 2 ||
        video.videoWidth === 0 ||
        video.videoHeight === 0
      ) {
        return;
      }

      // Sync canvas backing size to rendered element
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Run synchronous MediaPipe inference whenever a new video frame arrives
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const ts = Math.max(Math.round(now), lastDetectTsRef.current + 1);
        lastDetectTsRef.current = ts;

        try {
          const result = runWithFilteredMediaPipeInfo(() =>
            landmarker.detectForVideo(video, ts)
          );
          const candidate = selectNearestFace(
            result.faceLandmarks,
            lockedFaceCenterRef.current
          );

          if (candidate) {
            lockedFaceCenterRef.current = {
              cx: candidate.cx,
              cy: candidate.cy,
              area: candidate.area,
            };
            const smoothed = smootherRef.current.smooth(
              result.faceLandmarks[candidate.index],
              now
            );
            latestLandmarksRef.current = smoothed;

            const luma = lumaCtx ? estimateFrameLuminance(video, lumaCtx) : 128;
            const mat = result.facialTransformationMatrixes?.[candidate.index]?.data;
            const metrics = computeLiveFaceMetrics(
              smoothed,
              video.videoWidth || 1280,
              video.videoHeight || 720,
              luma,
              mat
            );
            latestMetricsRef.current = metrics;

            // Update Stage 1 -> Stage 2 once face is locked stably
            if (stageRef.current === 1) {
              stage1FaceFramesRef.current += 1;
              const elapsedInStage1 = now - stageEnteredAtRef.current;
              if (stage1FaceFramesRef.current >= 5 && elapsedInStage1 >= 1150) {
                transitionStage(2);
              }
            }

            // Stage 3: accumulate 30 steady well-lit frames AND run at least 2.6s so all 5 measurement animations render clearly
            if (stageRef.current === 3) {
              if (!metrics.guidanceHint) {
                samplesRef.current.push(metrics);
                if (samplesRef.current.length % 5 === 1) {
                  captureCleanSnapshot(video, smoothed, metrics);
                }
                const elapsedInStage3 = now - stageEnteredAtRef.current;
                if (samplesRef.current.length >= 30 && elapsedInStage3 >= 2600) {
                  captureCleanSnapshot(video, smoothed, metrics);
                  transitionStage(4);
                }
              }
            } else if (stageRef.current === 4 && !bestFrameSnapshotRef.current) {
              captureCleanSnapshot(video, smoothed, metrics);
            }

            // Throttled React UI state sync (~8Hz) for numbers, donut progress & guidance
            if (now - lastUiSync > 120) {
              lastUiSync = now;
              setGuidanceHint(metrics.guidanceHint);
              setSampleProgress(Math.min(30, samplesRef.current.length));
              setLiveReadout({
                eyeDistanceMm: metrics.eyeDistanceMm,
                nasalWidthMm: metrics.nasalWidthMm,
                faceWidthMm: metrics.faceWidthMm,
                foreheadWidthMm: metrics.foreheadWidthMm,
                cheekboneWidthMm: metrics.cheekboneWidthMm,
                jawlineLengthMm: metrics.jawlineLengthMm,
                jawlineWidthMm: metrics.jawlineWidthMm,
                faceLengthMm: metrics.faceLengthMm,
                faceShape: metrics.faceShape,
                jawlineProfile: metrics.jawlineProfile,
              });
            }
          } else {
            lockedFaceCenterRef.current = null;
            latestLandmarksRef.current = null;
            stage1FaceFramesRef.current = 0;
            if (now - lastUiSync > 150) {
              lastUiSync = now;
              setGuidanceHint(stageRef.current >= 2 ? 'Center your face in view' : null);
            }
          }
        } catch {
          // ignore transient frame detect errors
        }
      }

      // ---------- Clear & Draw Mirrored Real-Time AR Canvas Overlays ----------
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const cw = canvas.width;
      const ch = canvas.height;
      const coverScale = Math.max(cw / vw, ch / vh);
      const drawW = vw * coverScale;
      const drawH = vh * coverScale;
      const offX = (cw - drawW) / 2;
      const offY = (ch - drawH) / 2;

      const toCanvas = (nx: number, ny: number) => ({
        x: offX + (1 - nx) * drawW,
        y: offY + ny * drawH,
      });

      const currStage = stageRef.current;
      const elapsed = now - stageEnteredAtRef.current;
      const lms = latestLandmarksRef.current;
      const metrics = latestMetricsRef.current;

      // Update smoothly interpolated face bounding box in mirrored normalized coords
      if (metrics) {
        const mirMinX = 1 - metrics.maxX;
        const mirMaxX = 1 - metrics.minX;
        const padX = (mirMaxX - mirMinX) * 0.14;
        const padTop = (metrics.maxY - metrics.minY) * 0.18;
        const padBot = (metrics.maxY - metrics.minY) * 0.08;
        const targetBox = {
          minX: mirMinX - padX,
          minY: metrics.minY - padTop,
          maxX: mirMaxX + padX,
          maxY: metrics.maxY + padBot,
        };
        const smoothK = 0.22;
        activeBoxRef.current.minX = lerp(activeBoxRef.current.minX, targetBox.minX, smoothK);
        activeBoxRef.current.minY = lerp(activeBoxRef.current.minY, targetBox.minY, smoothK);
        activeBoxRef.current.maxX = lerp(activeBoxRef.current.maxX, targetBox.maxX, smoothK);
        activeBoxRef.current.maxY = lerp(activeBoxRef.current.maxY, targetBox.maxY, smoothK);
      }

      // Helper to draw corner-bracket crosshair around box
      const drawBrackets = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        armLen: number,
        color: string,
        lineWidth: number
      ) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const corners = [
          [
            [x0, y0 + armLen],
            [x0, y0],
            [x0 + armLen, y0],
          ],
          [
            [x1 - armLen, y0],
            [x1, y0],
            [x1, y0 + armLen],
          ],
          [
            [x0, y1 - armLen],
            [x0, y1],
            [x0 + armLen, y1],
          ],
          [
            [x1 - armLen, y1],
            [x1, y1],
            [x1, y1 - armLen],
          ],
        ];
        for (const c of corners) {
          ctx.beginPath();
          ctx.moveTo(c[0][0], c[0][1]);
          ctx.lineTo(c[1][0], c[1][1]);
          ctx.lineTo(c[2][0], c[2][1]);
          ctx.stroke();
        }
        ctx.restore();
      };

      const drawLandmarkDots = (
        points: NormalizedLandmarkPoint[],
        dotColor: string,
        radius: number
      ) => {
        ctx.save();
        ctx.fillStyle = dotColor;
        for (const idx of LANDMARK_MEASUREMENT_DOTS) {
          const lm = points[idx];
          if (!lm) continue;
          const pt = toCanvas(lm.x, lm.y);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      };

      const traceSmoothClosedPath = (pts: Array<{ x: number; y: number }>) => {
        if (pts.length < 3) return;
        ctx.beginPath();
        const firstMidX = (pts[pts.length - 1].x + pts[0].x) / 2;
        const firstMidY = (pts[pts.length - 1].y + pts[0].y) / 2;
        ctx.moveTo(firstMidX, firstMidY);
        for (let i = 0; i < pts.length; i++) {
          const p0 = pts[i];
          const p1 = pts[(i + 1) % pts.length];
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;
          ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
        }
        ctx.closePath();
      };

      const tl = toCanvas(activeBoxRef.current.minX, activeBoxRef.current.minY);
      const br = toCanvas(activeBoxRef.current.maxX, activeBoxRef.current.maxY);

      // STAGE 1: Sleek pulsing blue corner-bracket crosshair + optical target ring
      if (currStage === 1) {
        const pulse = 1 + Math.sin(now * 0.0055) * 0.055;
        const bw = 250 * pulse;
        const bh = 200 * pulse;
        const cx = cw / 2;
        const cy = ch / 2;
        ctx.save();
        ctx.shadowColor = 'rgba(154, 216, 255, 0.55)';
        ctx.shadowBlur = 14;
        drawBrackets(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2, 48, '#9AD8FF', 6);
        ctx.strokeStyle = 'rgba(154, 216, 255, 0.45)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 12]);
        ctx.beginPath();
        ctx.arc(cx, cy, 54 * pulse, now * 0.0012, now * 0.0012 + Math.PI * 1.65);
        ctx.stroke();
        ctx.restore();
      }

      // STAGE 2: Green brackets move smoothly onto the locked face bounding box with glow
      if (currStage === 2) {
        const moveP = easeOutCubic(elapsed / 600);
        const startTL = { x: cw / 2 - 125, y: ch / 2 - 100 };
        const startBR = { x: cw / 2 + 125, y: ch / 2 + 100 };
        const x0 = lerp(startTL.x, tl.x, moveP);
        const y0 = lerp(startTL.y, tl.y, moveP);
        const x1 = lerp(startBR.x, br.x, moveP);
        const y1 = lerp(startBR.y, br.y, moveP);
        ctx.save();
        ctx.shadowColor = 'rgba(182, 255, 66, 0.55)';
        ctx.shadowBlur = 16;
        drawBrackets(x0, y0, x1, y1, lerp(48, 66, moveP), '#B6FF42', 8);
        ctx.restore();
      }

      // STAGE 3: Sleek yellow C-brackets + progressive face-shape lock preview + live eye, nose & landmark dots
      if (currStage === 3) {
        const extP = easeOutCubic(elapsed / 550);
        const boxW = br.x - tl.x;
        const boxH = br.y - tl.y;

        ctx.save();
        ctx.shadowColor = 'rgba(255, 214, 0, 0.48)';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = '#FFD600';
        ctx.lineWidth = 8.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const hArm = lerp(boxW * 0.25, boxW * 0.34, extP);
        const vArm = lerp(boxH * 0.22, boxH * 0.5, extP);
        // Left C
        ctx.beginPath();
        ctx.moveTo(tl.x + hArm, tl.y);
        ctx.lineTo(tl.x, tl.y);
        ctx.lineTo(tl.x, tl.y + vArm);
        ctx.moveTo(tl.x, br.y - vArm);
        ctx.lineTo(tl.x, br.y);
        ctx.lineTo(tl.x + hArm, br.y);
        ctx.stroke();
        // Right C
        ctx.beginPath();
        ctx.moveTo(br.x - hArm, tl.y);
        ctx.lineTo(br.x, tl.y);
        ctx.lineTo(br.x, tl.y + vArm);
        ctx.moveTo(br.x, br.y - vArm);
        ctx.lineTo(br.x, br.y);
        ctx.lineTo(br.x - hArm, br.y);
        ctx.stroke();
        ctx.restore();

        if (lms && lms.length >= 478) {
          const ovalPts = FACE_OVAL_INDICES.map((idx) => toCanvas(lms[idx].x, lms[idx].y));
          const progressFrac = Math.min(1, samplesRef.current.length / 30);

          // Subtle sleek face perimeter guide intensifying as frames lock
          ctx.save();
          traceSmoothClosedPath(ovalPts);
          ctx.strokeStyle = `rgba(255, 214, 0, ${(0.2 + progressFrac * 0.35).toFixed(2)})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 8]);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.strokeStyle = '#FFD600';
          ctx.lineWidth = 4.5;
          ctx.setLineDash([8, 7]);
          ctx.lineCap = 'round';

          for (const loop of [LEFT_EYE_CONTOUR, RIGHT_EYE_CONTOUR]) {
            ctx.beginPath();
            loop.forEach((idx, i) => {
              const p = toCanvas(lms[idx].x, lms[idx].y);
              if (i === 0) ctx.moveTo(p.x, p.y);
              else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.stroke();
          }

          // Nose outline
          ctx.beginPath();
          NOSE_OUTLINE_INDICES.forEach((idx, i) => {
            const p = toCanvas(lms[idx].x, lms[idx].y);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();

          // Live iris crosshairs + PD connector
          const lIris = toCanvas(lms[LEFT_IRIS_CENTER].x, lms[LEFT_IRIS_CENTER].y);
          const rIris = toCanvas(lms[RIGHT_IRIS_CENTER].x, lms[RIGHT_IRIS_CENTER].y);
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(lIris.x, lIris.y);
          ctx.lineTo(rIris.x, rIris.y);
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.fillStyle = '#FFD600';
          for (const iris of [lIris, rIris]) {
            ctx.beginPath();
            ctx.arc(iris.x, iris.y, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(iris.x, iris.y, 10, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();

          // Key 3D facial proportion landmark dots
          drawLandmarkDots(lms, '#FFE45E', 3.8);

          // Sequential 5-Measurement AR Caliper Animation directly on the user's face:
          // 1) Forehead Width, 2) Cheekbone Width, 3) Jawline Width, 4) Jawline Length, 5) Face Length
          const animT = Math.min(1, Math.max(progressFrac * 0.45, elapsed / 2450));
          const segProgress = (start: number, end: number) =>
            easeOutCubic(Math.max(0, Math.min(1, (animT - start) / (end - start))));

          const drawCaliperBadge = (x: number, y: number, text: string, color: string, alpha: number) => {
            if (alpha <= 0.05) return;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = '600 13px "JetBrains Mono", monospace';
            const tw = ctx.measureText(text).width;
            const bw = tw + 16;
            const bh = 22;
            const rx = Math.max(8, Math.min(cw - bw - 8, x - bw / 2));
            const ry = Math.max(8, Math.min(ch - bh - 8, y - bh / 2));
            ctx.fillStyle = 'rgba(10, 22, 38, 0.84)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(rx, ry, bw, bh, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, rx + 8, ry + bh / 2 + 0.5);
            ctx.restore();
          };

          const drawHorizontalCaliper = (
            a: { x: number; y: number },
            b: { x: number; y: number },
            p: number,
            color: string,
            label: string,
            badgeOffsetY: number
          ) => {
            if (p <= 0.01) return;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const curAx = lerp(mx, a.x, p);
            const curAy = lerp(my, a.y, p);
            const curBx = lerp(mx, b.x, p);
            const curBy = lerp(my, b.y, p);
            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(curAx, curAy);
            ctx.lineTo(curBx, curBy);
            ctx.stroke();
            if (p > 0.72) {
              const tickH = 8 * ((p - 0.72) / 0.28);
              ctx.beginPath();
              ctx.moveTo(curAx, curAy - tickH);
              ctx.lineTo(curAx, curAy + tickH);
              ctx.moveTo(curBx, curBy - tickH);
              ctx.lineTo(curBx, curBy + tickH);
              ctx.stroke();
            }
            ctx.fillStyle = '#FFFFFF';
            for (const endPt of [
              { x: curAx, y: curAy },
              { x: curBx, y: curBy },
            ]) {
              ctx.beginPath();
              ctx.arc(endPt.x, endPt.y, 4, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
            drawCaliperBadge(mx, my + badgeOffsetY, label, color, Math.min(1, p * 1.35));
          };

          const fL = toCanvas(lms[54].x, lms[54].y);
          const fR = toCanvas(lms[284].x, lms[284].y);
          const cL = toCanvas(lms[234].x, lms[234].y);
          const cR = toCanvas(lms[454].x, lms[454].y);
          const jL = toCanvas(lms[172].x, lms[172].y);
          const jR = toCanvas(lms[397].x, lms[397].y);
          const topLm = toCanvas(lms[10].x, lms[10].y);
          const browMid = toCanvas(lms[168].x, lms[168].y);
          const topHairline = {
            x: topLm.x - (browMid.x - topLm.x) * 0.44,
            y: topLm.y - (browMid.y - topLm.y) * 0.44,
          };
          const chinPt = toCanvas(lms[152].x, lms[152].y);

          // 1. Forehead Width
          drawHorizontalCaliper(
            fL,
            fR,
            segProgress(0.0, 0.24),
            '#38BDF8',
            `Forehead Width: ${metrics?.foreheadWidthMm ?? liveReadout.foreheadWidthMm} mm`,
            -22
          );

          // 2. Cheekbone Width
          drawHorizontalCaliper(
            cL,
            cR,
            segProgress(0.18, 0.42),
            '#FFD600',
            `Cheekbone Width: ${metrics?.cheekboneWidthMm ?? liveReadout.cheekboneWidthMm} mm`,
            -20
          );

          // 3. Jawline Width
          drawHorizontalCaliper(
            jL,
            jR,
            segProgress(0.36, 0.60),
            '#FF9F2E',
            `Jawline Width: ${metrics?.jawlineWidthMm ?? liveReadout.jawlineWidthMm} mm`,
            -18
          );

          // 4. Jawline Length (both mandible curves)
          const jawLenP = segProgress(0.54, 0.80);
          if (jawLenP > 0.01) {
            ctx.save();
            ctx.shadowColor = '#34D399';
            ctx.shadowBlur = 12;
            ctx.strokeStyle = '#34D399';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (const chain of [LEFT_JAWLINE_INDICES, RIGHT_JAWLINE_INDICES]) {
              const pts = chain.map((idx) => toCanvas(lms[idx].x, lms[idx].y));
              const maxSeg = jawLenP * (pts.length - 1);
              const fullSegs = Math.floor(maxSeg);
              const frac = maxSeg - fullSegs;
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i <= fullSegs && i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
              }
              let headPt = pts[Math.min(fullSegs, pts.length - 1)];
              if (fullSegs + 1 < pts.length) {
                headPt = {
                  x: lerp(pts[fullSegs].x, pts[fullSegs + 1].x, frac),
                  y: lerp(pts[fullSegs].y, pts[fullSegs + 1].y, frac),
                };
                ctx.lineTo(headPt.x, headPt.y);
              }
              ctx.stroke();
              ctx.fillStyle = '#FFFFFF';
              ctx.beginPath();
              ctx.arc(headPt.x, headPt.y, 4.5, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
            drawCaliperBadge(
              chinPt.x,
              chinPt.y + 24,
              `Jawline Length: ${metrics?.jawlineLengthMm ?? liveReadout.jawlineLengthMm} mm`,
              '#34D399',
              Math.min(1, jawLenP * 1.35)
            );
          }

          // 5. Face Length (vertical midline top -> chin)
          const faceLenP = segProgress(0.72, 1.0);
          if (faceLenP > 0.01) {
            const curBotX = lerp(topHairline.x, chinPt.x, faceLenP);
            const curBotY = lerp(topHairline.y, chinPt.y, faceLenP);
            ctx.save();
            ctx.shadowColor = '#F472B6';
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#F472B6';
            ctx.lineWidth = 3;
            ctx.setLineDash([7, 5]);
            ctx.beginPath();
            ctx.moveTo(topHairline.x, topHairline.y);
            ctx.lineTo(curBotX, curBotY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(topHairline.x - 10, topHairline.y);
            ctx.lineTo(topHairline.x + 10, topHairline.y);
            if (faceLenP > 0.85) {
              ctx.moveTo(curBotX - 10, curBotY);
              ctx.lineTo(curBotX + 10, curBotY);
            }
            ctx.stroke();
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(topHairline.x, topHairline.y, 4, 0, Math.PI * 2);
            ctx.arc(curBotX, curBotY, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            drawCaliperBadge(
              topHairline.x,
              topHairline.y - 22,
              `Face Length: ${metrics?.faceLengthMm ?? liveReadout.faceLengthMm} mm`,
              '#F472B6',
              Math.min(1, faceLenP * 1.35)
            );
          }
        }
      }

      // STAGE 4:
      // 0-650ms: Particle morph + bilateral trace around face shape
      // 650-2150ms: Sleek scan line INSIDE the scanned face shape sliding up -> downwards
      // 2150-3000ms: Crisp WHITE flicker blink across the traced face shape before determining face shape
      if (currStage === 4 && lms && lms.length >= 468) {
        const ovalPts = FACE_OVAL_INDICES.map((idx) => toCanvas(lms[idx].x, lms[idx].y));
        let ovalMinX = Infinity;
        let ovalMaxX = -Infinity;
        let ovalMinY = Infinity;
        let ovalMaxY = -Infinity;
        for (const p of ovalPts) {
          if (p.x < ovalMinX) ovalMinX = p.x;
          if (p.x > ovalMaxX) ovalMaxX = p.x;
          if (p.y < ovalMinY) ovalMinY = p.y;
          if (p.y > ovalMaxY) ovalMaxY = p.y;
        }

        const morphP = easeOutCubic(elapsed / 650);
        const slideRaw = Math.max(0, Math.min(1, (elapsed - 650) / 1500));
        const slideEase = 0.5 - 0.5 * Math.cos(Math.PI * slideRaw);
        const isScanningDown = elapsed >= 650 && elapsed < 2150;
        const isFlickering = elapsed >= 2150;
        const flickerP = Math.max(0, Math.min(1, (elapsed - 2150) / 850));

        // 3 crisp white strobe flicker pulses right before determining face shape
        let blinkIntensity = 0;
        if (isFlickering) {
          if (flickerP <= 0.24) {
            blinkIntensity = Math.sin((flickerP / 0.24) * Math.PI);
          } else if (flickerP >= 0.3 && flickerP <= 0.54) {
            blinkIntensity = Math.sin(((flickerP - 0.3) / 0.24) * Math.PI);
          } else if (flickerP >= 0.6 && flickerP <= 0.96) {
            blinkIntensity = Math.sin(((flickerP - 0.6) / 0.36) * Math.PI);
          }
          blinkIntensity = Math.pow(Math.max(0, blinkIntensity), 0.72);
        }

        // Phase 4A: Particles lock from bounding box onto face contour
        if (morphP < 0.98) {
          const targets = [
            ...FACE_OVAL_INDICES,
            ...FACE_OVAL_INDICES,
            ...LEFT_EYE_CONTOUR.slice(0, 8),
            ...RIGHT_EYE_CONTOUR.slice(0, 8),
            ...NOSE_OUTLINE_INDICES.slice(0, 12),
          ];

          ctx.save();
          for (let i = 0; i < targets.length; i++) {
            const frac = i / targets.length;
            let sx = tl.x;
            let sy = tl.y;
            if (frac < 0.25) {
              sx = lerp(tl.x, br.x, frac / 0.25);
              sy = tl.y;
            } else if (frac < 0.5) {
              sx = br.x;
              sy = lerp(tl.y, br.y, (frac - 0.25) / 0.25);
            } else if (frac < 0.75) {
              sx = lerp(br.x, tl.x, (frac - 0.5) / 0.25);
              sy = br.y;
            } else {
              sx = tl.x;
              sy = lerp(br.y, tl.y, (frac - 0.75) / 0.25);
            }

            const tPt = toCanvas(lms[targets[i]].x, lms[targets[i]].y);
            const arcLift = Math.sin(morphP * Math.PI) * 22 * (i % 2 === 0 ? -1 : 1);
            const px = lerp(sx, tPt.x, morphP);
            const py = lerp(sy, tPt.y, morphP) + arcLift;

            ctx.fillStyle = morphP < 0.45 ? '#FFD600' : '#FF9F2E';
            ctx.beginPath();
            ctx.arc(px, py, lerp(5.2, 3.6, morphP), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // Phase 4B: Sleek horizontal scan line & volumetric mesh strictly INSIDE face oval sliding top -> bottom
        if (isScanningDown) {
          const scanY = lerp(ovalMinY, ovalMaxY, slideEase);

          ctx.save();
          traceSmoothClosedPath(ovalPts);
          ctx.clip();

          // Translucent scanned biometric wash from forehead down to active scan line
          const wakeHeight = Math.max(0, scanY - ovalMinY);
          if (wakeHeight > 2) {
            const wakeGrad = ctx.createLinearGradient(0, ovalMinY, 0, scanY);
            wakeGrad.addColorStop(0, 'rgba(59, 190, 255, 0.05)');
            wakeGrad.addColorStop(0.7, 'rgba(59, 190, 255, 0.14)');
            wakeGrad.addColorStop(1, 'rgba(255, 255, 255, 0.34)');
            ctx.fillStyle = wakeGrad;
            ctx.fillRect(ovalMinX - 10, ovalMinY, ovalMaxX - ovalMinX + 20, wakeHeight);

            // Subtle precision biometric grid lines inside scanned zone
            ctx.strokeStyle = 'rgba(200, 244, 255, 0.22)';
            ctx.lineWidth = 1;
            const stepY = 18;
            for (let gy = ovalMinY + stepY; gy < scanY - 6; gy += stepY) {
              ctx.beginPath();
              ctx.moveTo(ovalMinX - 8, gy);
              ctx.lineTo(ovalMaxX + 8, gy);
              ctx.stroke();
            }
          }

          // Volumetric trailing beam above the descending laser line
          const trailTop = Math.max(ovalMinY - 12, scanY - 62);
          const beamGrad = ctx.createLinearGradient(0, trailTop, 0, scanY);
          beamGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
          beamGrad.addColorStop(0.55, 'rgba(130, 232, 255, 0.28)');
          beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0.85)');
          ctx.fillStyle = beamGrad;
          ctx.fillRect(ovalMinX - 10, trailTop, ovalMaxX - ovalMinX + 20, scanY - trailTop);

          // Crisp glowing horizontal scan line confined within face oval
          ctx.shadowColor = '#FFFFFF';
          ctx.shadowBlur = 18;
          ctx.strokeStyle = 'rgba(165, 243, 252, 0.85)';
          ctx.lineWidth = 6.5;
          ctx.beginPath();
          ctx.moveTo(ovalMinX - 10, scanY);
          ctx.lineTo(ovalMaxX + 10, scanY);
          ctx.stroke();

          ctx.shadowBlur = 8;
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.moveTo(ovalMinX - 10, scanY);
          ctx.lineTo(ovalMaxX + 10, scanY);
          ctx.stroke();

          ctx.restore();
        }

        // Phase 4C: White flicker illumination inside the scanned face shape right before determination
        if (isFlickering && blinkIntensity > 0.01) {
          ctx.save();
          traceSmoothClosedPath(ovalPts);
          ctx.clip();
          ctx.fillStyle = `rgba(255, 255, 255, ${(0.28 * blinkIntensity).toFixed(3)})`;
          ctx.fillRect(ovalMinX - 12, ovalMinY - 12, ovalMaxX - ovalMinX + 24, ovalMaxY - ovalMinY + 24);
          ctx.restore();
        }

        // Traced Face Oval + Facial Contours (progressively traces in 4A, glows orange in 4B, blinks crisp white in 4C)
        const strokeColor =
          isFlickering && blinkIntensity > 0.2
            ? '#FFFFFF'
            : '#FF9F2E';
        const dotColor =
          isFlickering && blinkIntensity > 0.2
            ? '#FFFFFF'
            : '#FFD600';

        if (morphP < 0.99 && !isScanningDown && !isFlickering) {
          // Bilateral progressive trace from top (index 0) down both cheeks to chin (index 18)
          const halfCount = Math.max(1, Math.round(morphP * 18));
          ctx.save();
          ctx.shadowColor = 'rgba(255, 159, 46, 0.7)';
          ctx.shadowBlur = 12;
          ctx.strokeStyle = '#FF9F2E';
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          ctx.beginPath();
          for (let i = 0; i <= halfCount; i++) {
            const pt = ovalPts[i % ovalPts.length];
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(ovalPts[0].x, ovalPts[0].y);
          for (let i = 1; i <= halfCount; i++) {
            const pt = ovalPts[(ovalPts.length - i) % ovalPts.length];
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.stroke();
          ctx.restore();
        } else {
          // Full closed sleek face-shape perimeter + eyes + nose
          ctx.save();
          ctx.shadowColor = isFlickering
            ? `rgba(255, 255, 255, ${(0.4 + blinkIntensity * 0.6).toFixed(2)})`
            : 'rgba(255, 159, 46, 0.55)';
          ctx.shadowBlur = isFlickering ? 12 + blinkIntensity * 22 : 14;
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = isFlickering && blinkIntensity > 0.2 ? 6.5 : 5.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          // Solid sleek outer face shape trace
          traceSmoothClosedPath(ovalPts);
          ctx.stroke();

          // Inner eye & nose contours
          ctx.lineWidth = 4;
          ctx.setLineDash([8, 7]);
          for (const loop of [LEFT_EYE_CONTOUR, RIGHT_EYE_CONTOUR, NOSE_OUTLINE_INDICES]) {
            ctx.beginPath();
            loop.forEach((idx, i) => {
              const p = toCanvas(lms[idx].x, lms[idx].y);
              if (i === 0) ctx.moveTo(p.x, p.y);
              else ctx.lineTo(p.x, p.y);
            });
            if (loop !== NOSE_OUTLINE_INDICES) ctx.closePath();
            ctx.stroke();
          }
          ctx.restore();
        }

        // Highlight landmark nodes as the top-to-bottom scan line passes them or during white flicker
        if (isScanningDown) {
          const scanY = lerp(ovalMinY, ovalMaxY, slideEase);
          ctx.save();
          for (const idx of LANDMARK_MEASUREMENT_DOTS) {
            const lm = lms[idx];
            if (!lm) continue;
            const pt = toCanvas(lm.x, lm.y);
            const scanned = pt.y <= scanY + 4;
            ctx.fillStyle = scanned ? '#FFFFFF' : '#FF9F2E';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, scanned ? 4.4 : 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } else {
          drawLandmarkDots(lms, dotColor, isFlickering && blinkIntensity > 0.2 ? 4.8 : 4.0);
        }
      }

      // STAGE 5: Neon green lock-in across the traced face shape & contours
      if (currStage === 5 && lms && lms.length >= 468) {
        const ovalPts = FACE_OVAL_INDICES.map((idx) => toCanvas(lms[idx].x, lms[idx].y));
        const flashFade = Math.max(0, 1 - elapsed / 650);

        if (flashFade > 0.02) {
          ctx.save();
          traceSmoothClosedPath(ovalPts);
          ctx.clip();
          ctx.fillStyle = `rgba(143, 255, 0, ${(0.18 * flashFade).toFixed(3)})`;
          ctx.fillRect(0, 0, cw, ch);
          ctx.restore();
        }

        ctx.save();
        ctx.shadowColor = 'rgba(143, 255, 0, 0.65)';
        ctx.shadowBlur = 16;
        ctx.strokeStyle = '#8FFF00';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        traceSmoothClosedPath(ovalPts);
        ctx.stroke();

        ctx.lineWidth = 4.5;
        ctx.setLineDash([10, 8]);
        for (const loop of [LEFT_EYE_CONTOUR, RIGHT_EYE_CONTOUR, NOSE_OUTLINE_INDICES]) {
          ctx.beginPath();
          loop.forEach((idx, i) => {
            const p = toCanvas(lms[idx].x, lms[idx].y);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          if (loop !== NOSE_OUTLINE_INDICES) ctx.closePath();
          ctx.stroke();
        }
        // Locked 5-measurement proportional axes in soft neon green
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = 'rgba(182, 255, 66, 0.72)';
        ctx.setLineDash([5, 5]);
        for (const [ia, ib] of [
          [54, 284],
          [234, 454],
          [172, 397],
          [10, 152],
        ] as Array<[number, number]>) {
          const pa = toCanvas(lms[ia].x, lms[ia].y);
          const pb = toCanvas(lms[ib].x, lms[ib].y);
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
        ctx.restore();
        drawLandmarkDots(lms, '#B6FF42', 4.3);
      }
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [modelReady, cameraError, transitionStage, captureCleanSnapshot]);

  const stageConfig = {
    1: {
      pillText: 'Scanning for Face...',
      pillBg: 'bg-[#FF9F2E]',
      dotColor: '#2B6CB0',
      barColor: '#FF9F2E',
    },
    2: {
      pillText: 'Face Detected',
      pillBg: 'bg-[#8FFF00]',
      dotColor: '#7BE800',
      barColor: '#6AD400',
    },
    3: {
      pillText: 'Measuring Facial Structure...',
      pillBg: 'bg-[#FFD600]',
      dotColor: '#E8B800',
      barColor: '#F5B800',
    },
    4: {
      pillText: 'Identifying Facial Structure...',
      pillBg: 'bg-[#FF8C24]',
      dotColor: '#D96B1B',
      barColor: '#FF8C24',
    },
    5: {
      pillText: 'Facial Scan Complete',
      pillBg: 'bg-[#8FFF00]',
      dotColor: '#7BE800',
      barColor: '#6AD400',
    },
  }[stage];

  const gaugePct = Math.round((sampleProgress / 30) * 100);
  const overallProgressPct =
    stage === 1
      ? modelReady
        ? 14
        : 6
      : stage === 2
      ? 28
      : stage === 3
      ? Math.round(30 + (sampleProgress / 30) * 48)
      : stage === 4
      ? 88
      : 100;
  const dashCircle = 238.76; // 2 * PI * 38

  return (
    <div className="w-full h-full flex flex-col">
      <KioskHeader centerPillText="Face Measurement Interface" />

      {/* Full-Screen Live Camera Stage */}
      <main className="relative flex-1 bg-black overflow-hidden flex flex-col items-center justify-between pt-8">
        {/* Live Mirrored Webcam Feed */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
        />

        {/* Subtle vignette + halftone edge framing */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/30 pointer-events-none" />

        <HalftoneDots
          side="left"
          color={stageConfig.dotColor}
          opacity={0.72}
          className="absolute left-0 top-0 bottom-0 w-[21%] h-full z-10 transition-all duration-500"
        />
        <HalftoneDots
          side="right"
          color={stageConfig.dotColor}
          opacity={0.72}
          className="absolute right-0 top-0 bottom-0 w-[21%] h-full z-10 transition-all duration-500"
        />

        {/* Real-Time AR Tracking Transparent Canvas Overlay */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full z-20 pointer-events-none"
        />

        {/* Top Animated Status Pill */}
        <div className="relative z-30 flex flex-col items-center gap-3">
          <div
            className={`px-10 py-2.5 rounded-2xl font-mono-ui text-[32px] font-medium text-white shadow-lg transition-all duration-500 ${stageConfig.pillBg}`}
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.45)' }}
          >
            {stage === 5 && finalScanResult
              ? `Detected Face Shape: ${finalScanResult.faceShape}`
              : stageConfig.pillText}
          </div>

          {stage < 5 && !cameraError && (
            <div className="px-7 py-1.5 rounded-full bg-black/70 border border-white/25 text-white font-mono-ui text-[20px] font-medium shadow-md">
              Please look directly at the camera.
            </div>
          )}

          {/* Warmup / Live Guidance Hint Pill */}
          {!modelReady && !cameraError && (
            <div className="px-6 py-1.5 rounded-full bg-black/75 border border-[#9AD8FF]/70 text-[#9AD8FF] font-mono-ui text-[18px] font-medium shadow-md">
              Initializing 3D Face Landmarker...
            </div>
          )}
          {modelReady && guidanceHint && !cameraError && stage >= 2 && stage <= 4 && (
            <div className="px-6 py-1.5 rounded-full bg-black/75 border-2 border-[#FFD600] text-[#FFD600] font-mono-ui text-[20px] font-semibold shadow-md animate-pulse">
              {guidanceHint}
            </div>
          )}
        </div>

        {/* Camera Permission / Device Fallback Overlay */}
        {cameraError && (
          <div className="relative z-40 m-auto max-w-[740px] bg-white/95 rounded-[32px] p-10 shadow-2xl text-center space-y-6">
            <div className="w-full bg-[#3BBEFF] text-white py-2.5 rounded-full font-mono-ui text-[26px] font-medium">
              Camera Access Required
            </div>
            <p className="font-mono-ui text-[21px] text-[#1E293B] leading-relaxed">
              {cameraError}
            </p>
            <div className="flex items-center justify-center gap-8 pt-2">
              <ReturnButton
                onClick={() => {
                  stopCameraStream();
                  onReturn();
                }}
                className="w-[240px]"
              />
              <button
                type="button"
                onClick={() => void startCamera()}
                className="w-[260px] h-[54px] rounded-full bg-[#176BA8] hover:bg-[#135A8E] text-white font-mono-ui text-[22px] font-medium shadow-md cursor-pointer"
              >
                Retry Camera
              </button>
            </div>
          </div>
        )}

        {/* Stage 3 & Stage 4 Morphing Side Widgets (5 Facial Measurements + Live Donut Gauges) */}
        {(stage === 3 || stage === 4) && !cameraError && (
          <>
            {/* Left Side Morphing Panel */}
            <div
              className={`absolute left-[2.5%] bottom-[6%] z-30 transition-all duration-700 flex items-center justify-center ${
                stage === 3
                  ? 'w-[285px] rounded-[28px] bg-black/55 border border-[#FFD600]/45 px-5 py-4'
                  : 'w-[305px] rounded-[32px] bg-[#7A4414]/82 border border-[#FF9F2E]/55 px-5 py-4'
              }`}
            >
              <div className="font-mono-ui text-white space-y-1.5 w-full">
                <div className="flex items-center justify-between text-[13px] text-[#FFD600] uppercase tracking-wider font-semibold">
                  <span>{stage === 3 ? 'Live 5-Point Scan' : 'Contour Proportions'}</span>
                  <span className="tabular-nums">{sampleProgress}/30</span>
                </div>
                <div className="flex justify-between text-[15px] tabular-nums">
                  <span className="text-[#BAE6FD]">Forehead Width:</span>
                  <span className="font-bold">{liveReadout.foreheadWidthMm} mm</span>
                </div>
                <div className="flex justify-between text-[15px] tabular-nums">
                  <span className="text-[#FDE047]">Cheekbone Width:</span>
                  <span className="font-bold">{liveReadout.cheekboneWidthMm} mm</span>
                </div>
                <div className="flex justify-between text-[15px] tabular-nums">
                  <span className="text-[#6EE7B7]">Jawline Length:</span>
                  <span className="font-bold">{liveReadout.jawlineLengthMm} mm</span>
                </div>
                <div className="flex justify-between text-[15px] tabular-nums">
                  <span className="text-[#FDBA74]">Jawline Width:</span>
                  <span className="font-bold">{liveReadout.jawlineWidthMm} mm</span>
                </div>
                <div className="flex justify-between text-[15px] tabular-nums">
                  <span className="text-[#F9A8D4]">Face Length:</span>
                  <span className="font-bold">{liveReadout.faceLengthMm} mm</span>
                </div>
                <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full bg-[#FF9F2E] rounded-full transition-all duration-150"
                    style={{ width: `${stage === 4 ? 92 : Math.max(12, gaugePct)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Right Side Morphing Panel */}
            <div
              className={`absolute right-[2.5%] top-[28%] z-30 transition-all duration-700 flex items-center justify-center ${
                stage === 3
                  ? 'w-[205px] h-[205px] rounded-full bg-black/45 border border-[#FFD600]/40'
                  : 'w-[335px] h-[195px] rounded-[42px] bg-[#7A4414]/78 border border-[#FF9F2E]/50 px-6'
              }`}
            >
              {stage === 3 ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <svg
                    viewBox="0 0 120 120"
                    className="w-[186px] h-[186px] animate-[spin_5s_linear_infinite]"
                    aria-hidden="true"
                  >
                    <circle
                      cx="60"
                      cy="60"
                      r="38"
                      fill="none"
                      stroke="#E88D22"
                      strokeWidth="16"
                      strokeDasharray="118 28 58 24"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center font-mono-ui text-white">
                    <span className="text-[23px] font-bold tabular-nums">
                      {liveReadout.eyeDistanceMm} mm
                    </span>
                    <span className="text-[13px] text-[#FFD600]">Eye PD</span>
                    <span className="text-[12px] text-white/80 mt-0.5 tabular-nums">
                      Bridge: {liveReadout.nasalWidthMm} mm
                    </span>
                  </div>
                </div>
              ) : (
                <div className="font-mono-ui text-white space-y-2.5 w-full">
                  <div className="text-[16px] text-[#FFB86B] uppercase tracking-wide">
                    Optical Alignment
                  </div>
                  <div className="text-[20px] font-semibold tabular-nums">
                    Eye PD: {liveReadout.eyeDistanceMm} mm
                  </div>
                  <div className="text-[18px] text-[#FFE2BD] tabular-nums">
                    Nasal Bridge: {liveReadout.nasalWidthMm} mm
                  </div>
                  <div className="text-[16px] italic text-[#FFD600]">
                    Evaluating 5 facial ratios...
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Stage 5: Green Result Panels with Detected Shape + All 5 Facial Measurements */}
        {stage === 5 && finalScanResult && !cameraError && (
          <>
            <div className="absolute left-[2%] bottom-[4%] w-[520px] h-[255px] bg-[#5F8E00]/78 border border-[#B6FF42]/65 rounded-[24px] p-6 flex items-center gap-5 z-30 shadow-xl transition-all duration-700">
              <canvas
                ref={miniSketchCanvasRef}
                width={150}
                height={190}
                className="w-[140px] h-[180px] shrink-0"
              />
              <div className="flex flex-col gap-3">
                <span className="font-mono-ui text-[21px] text-[#AEFF45]">
                  Detected Face Shape:
                </span>
                <FaceShapeChip shape={finalScanResult.faceShape} size="md" />
                <span className="font-mono-ui text-[15px] text-[#E6FFC2]">
                  {finalScanResult.jawlineProfile}
                </span>
              </div>
            </div>

            {/* Dotted green connector */}
            <div className="absolute right-[555px] top-[46%] w-[150px] border-t-[10px] border-dotted border-[#8FFF00] z-20" />

            <div className="absolute right-[2%] top-[20%] w-[530px] bg-[#5F8E00]/80 border border-[#B6FF42]/65 rounded-[24px] p-6 z-30 shadow-xl flex flex-col justify-center gap-2 font-mono-ui text-[19px] text-[#C6FF7A] transition-all duration-700">
              <div className="text-[21px] border-b border-[#B6FF42]/35 pb-2 mb-1">
                Detected Face Shape:{' '}
                <span className="text-white font-bold">{finalScanResult.faceShape}</span>
              </div>
              <div className="flex justify-between tabular-nums">
                <span>Forehead Width:</span>
                <span className="text-white font-semibold">{countDisplay.foreheadWidthMm} mm</span>
              </div>
              <div className="flex justify-between tabular-nums">
                <span>Cheekbone Width:</span>
                <span className="text-white font-semibold">{countDisplay.cheekboneWidthMm} mm</span>
              </div>
              <div className="flex justify-between tabular-nums">
                <span>Jawline Length:</span>
                <span className="text-white font-semibold">{countDisplay.jawlineLengthMm} mm</span>
              </div>
              <div className="flex justify-between tabular-nums">
                <span>Jawline Width:</span>
                <span className="text-white font-semibold">{countDisplay.jawlineWidthMm} mm</span>
              </div>
              <div className="flex justify-between tabular-nums">
                <span>Face Length:</span>
                <span className="text-white font-semibold">{countDisplay.faceLengthMm} mm</span>
              </div>
              <div className="text-[15px] text-[#E2FFB8] pt-1.5 border-t border-[#B6FF42]/30 flex justify-between tabular-nums">
                <span>Eye PD: {countDisplay.eyeDistanceMm} mm</span>
                <span>Bridge: {countDisplay.nasalWidthMm} mm</span>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Bottom White Footer — Confirm ONLY visible once Stage 5 complete */}
      <footer className="kiosk-footer-bg h-[84px] shrink-0 px-14 flex items-center justify-between">
        <ReturnButton
          onClick={() => {
            stopCameraStream();
            audioEngine.clearVoiceQueue();
            onReturn();
          }}
          className="w-[330px]"
        />

        <div className="flex-1 max-w-[660px] px-8 flex flex-col gap-2">
          <div className="flex items-center justify-between font-mono-ui text-[17px] text-[#3F4A54]">
            <span>
              Step {stage} of 5 ·{' '}
              {!modelReady && !cameraError
                ? 'Initializing 3D Face Landmarker...'
                : stage === 3 && guidanceHint
                ? `Paused: ${guidanceHint}`
                : stage < 5
                ? 'Scanning facial geometry...'
                : autoProceedSecs !== null
                ? `Detected Face Shape: ${finalScanResult?.faceShape} · Auto-confirming in ${autoProceedSecs}s`
                : 'Facial measurements locked'}
            </span>
            <span className="font-bold text-[#176BA8] tabular-nums">
              {overallProgressPct}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Facial geometry scan progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overallProgressPct}
            className="w-full h-[14px] bg-[#D6DEE6] rounded-full overflow-hidden shadow-inner"
          >
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${overallProgressPct}%`,
                backgroundColor: stageConfig.barColor,
              }}
            />
          </div>
        </div>

        <div className="w-[360px] flex justify-end">
          {stage === 5 && finalScanResult && (
            <ProceedButton
              label="Confirm"
              onClick={() => void handleProceedComplete()}
              countdownSecs={autoProceedSecs}
              className="min-w-[330px] px-7 animate-[fadeIn_0.35s_ease-out]"
            />
          )}
        </div>
      </footer>
    </div>
  );
};

export default FaceScan;
