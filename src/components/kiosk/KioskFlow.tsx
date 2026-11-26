import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CustomerPrescription,
  FaceShape,
  FacialScanResult,
  FrameItem,
  LensCatalogStore,
  OrganizeFilter,
  RulesEngineStore,
  StaffAccount,
  UsageSessionRecord,
} from '../../types/framefit';
import { audioEngine, HOME_WELCOME_PHRASE } from '../../utils/audioEngine';
import {
  getEstimatedLensPrice,
  requiresHighIndexFromPrescription,
} from '../../utils/recommendation';
import { AdminLoginView } from '../admin/AdminLoginModal';
import { FaceScan, FaceScanStage } from './FaceScan';
import { KioskScreen4Shortlist } from './KioskScreensCatalog';
import {
  KioskScreen1Welcome,
  KioskScreen2RxBudget,
  KioskScreenPrivacyConsent,
} from './KioskScreensIntro';
import { KioskScreen5TryOnCompare, KioskScreen6Summary } from './KioskScreensResult';
import { KioskP16Processing } from './KioskScreensScan';

type FlowStep =
  | 'SCREEN_1_WELCOME'
  | 'SCREEN_1B_PRIVACY_CONSENT'
  | 'SCREEN_2_RX_BUDGET'
  | 'SCREEN_3_FACE_SCAN'
  | 'SCREEN_3B_LOADING'
  | 'SCREEN_4_SHORTLIST'
  | 'SCREEN_5_TRY_ON'
  | 'SCREEN_6_SUMMARY';

const INITIAL_RX: CustomerPrescription = {
  hasPrescription: true,
  leftGrade: '-1.50',
  rightGrade: '-1.50',
  astigmatism: false,
  leftCyl: '0.00',
  leftAxis: '90',
  rightCyl: '0.00',
  rightAxis: '90',
  pdMm: '62',
};

const DEFAULT_BUDGET_PHP = 5000;

interface KioskFlowProps {
  frames: FrameItem[];
  lensCatalog: LensCatalogStore;
  rulesEngine: RulesEngineStore;
  onAdminLoginSuccess: (staff: StaffAccount) => void;
  onRecordAccessLog: (
    username: string,
    device: 'Kiosk-01' | 'Store-PC',
    result: 'Success' | 'Failed' | 'Locked Out'
  ) => void;
  onRecordSessionComplete: (session: UsageSessionRecord, purchasedFrameId: string) => void;
}

export const KioskFlow: React.FC<KioskFlowProps> = ({
  frames,
  lensCatalog,
  rulesEngine,
  onAdminLoginSuccess,
  onRecordAccessLog,
  onRecordSessionComplete,
}) => {
  const [step, setStep] = useState<FlowStep>('SCREEN_1_WELCOME');
  const [scale, setScale] = useState(1);

  // Hidden Admin trigger states on Screen 1
  const [avatarTapCount, setAvatarTapCount] = useState(0);
  const [adminKeyState, setAdminKeyState] = useState<'hidden' | 'visible' | 'hiding'>('hidden');
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const tapResetTimerRef = useRef<number | null>(null);
  const keyHideTimerRef = useRef<number | null>(null);

  // Strict workflow progression state (reset completely on End Session)
  const [privacyConsented, setPrivacyConsented] = useState(false);
  const [rxBudgetCompleted, setRxBudgetCompleted] = useState(false);
  const [prescription, setPrescription] = useState<CustomerPrescription>(INITIAL_RX);
  const [budgetPhp, setBudgetPhp] = useState<number>(DEFAULT_BUDGET_PHP);

  const [scanResult, setScanResult] = useState<FacialScanResult | null>(null);
  const [activeFaceShapeFilter, setActiveFaceShapeFilter] = useState<FaceShape | null>(null);
  const [activeOrganizeFilter, setActiveOrganizeFilter] = useState<OrganizeFilter | null>(
    'Most Accurate to Face Shape'
  );

  const [compareFrameIds, setCompareFrameIds] = useState<string[]>([]);
  const [favoriteFrameIds, setFavoriteFrameIds] = useState<string[]>([]);
  const [chosenFrameId, setChosenFrameId] = useState<string>('');
  const [chosenColor, setChosenColor] = useState<string>('');
  const [chosenLensTypeId, setChosenLensTypeId] = useState<string>('single-vision');
  const [chosenCoatingIds, setChosenCoatingIds] = useState<string[]>([]);
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [finalLensPrice, setFinalLensPrice] = useState<number>(0);
  const [finalTotalPrice, setFinalTotalPrice] = useState<number>(0);

  // Pre-fetch kiosk TTS voice lines in background & keep 1920x1080 responsive scaling
  useEffect(() => {
    audioEngine.preloadAudioAssets();
    const unlockOnGesture = () => {
      audioEngine.unlockAndPreload();
    };
    window.addEventListener('pointerdown', unlockOnGesture, { once: true, passive: true });
    window.addEventListener('keydown', unlockOnGesture, { once: true, passive: true });

    const updateScale = () => {
      const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      setScale(s);
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('pointerdown', unlockOnGesture);
      window.removeEventListener('keydown', unlockOnGesture);
      window.removeEventListener('resize', updateScale);
      audioEngine.clearVoiceQueue();
    };
  }, []);

  // Screen 1 attract loop: play friendly welcome voice + mouth lip-sync every 1m30s (90,000 ms)
  useEffect(() => {
    if (step !== 'SCREEN_1_WELCOME' || adminLoginOpen) return;

    const speakWelcome = () => {
      void audioEngine.speak(HOME_WELCOME_PHRASE, { tone: 'excited' });
    };

    const initialTimer = window.setTimeout(speakWelcome, 1200);
    const repeatInterval = window.setInterval(speakWelcome, 90_000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(repeatInterval);
    };
  }, [step, adminLoginOpen]);

  const resetSession = useCallback(() => {
    audioEngine.clearVoiceQueue();
    setPrivacyConsented(false);
    setRxBudgetCompleted(false);
    setPrescription(INITIAL_RX);
    setBudgetPhp(DEFAULT_BUDGET_PHP);
    setScanResult(null);
    setActiveFaceShapeFilter(null);
    setActiveOrganizeFilter('Most Accurate to Face Shape');
    setCompareFrameIds([]);
    setFavoriteFrameIds([]);
    setChosenFrameId('');
    setChosenColor('');
    setChosenLensTypeId('single-vision');
    setChosenCoatingIds([]);
    setOrderNumber('');
    setFinalLensPrice(0);
    setFinalTotalPrice(0);
    setStep('SCREEN_1_WELCOME');
  }, []);

  // Hidden 3-tap admin reveal on Screen 1
  const handleAvatarTap = () => {
    if (adminKeyState === 'visible') return;
    if (tapResetTimerRef.current) window.clearTimeout(tapResetTimerRef.current);
    if (keyHideTimerRef.current) window.clearTimeout(keyHideTimerRef.current);

    const next = avatarTapCount + 1;
    if (next >= 3) {
      setAvatarTapCount(0);
      audioEngine.unlockAndPreload();
      audioEngine.playPopGlitchSfx();
      setAdminKeyState('visible');
    } else {
      setAvatarTapCount(next);
      tapResetTimerRef.current = window.setTimeout(() => {
        setAvatarTapCount(0);
      }, 1500);
    }
  };

  const handleCloseAdminLoginModal = () => {
    setAdminLoginOpen(false);
    setAdminKeyState('hiding');
    if (keyHideTimerRef.current) window.clearTimeout(keyHideTimerRef.current);
    keyHideTimerRef.current = window.setTimeout(() => {
      setAdminKeyState('hidden');
    }, 430);
  };

  const matchingFramesUnderBudget = useMemo(
    () => frames.filter((f) => f.price <= budgetPhp).length,
    [frames, budgetPhp]
  );

  const activeChosenFrame = useMemo(
    () => frames.find((f) => f.id === chosenFrameId) || frames[0],
    [frames, chosenFrameId]
  );

  const activeLensTypeName = useMemo(() => {
    if (prescription.hasPrescription === false) return 'Frame Only (Plano)';
    const lt = lensCatalog.lensTypes.find((l) => l.id === chosenLensTypeId);
    const base = lt ? lt.name : 'Single Vision';
    return requiresHighIndexFromPrescription(prescription) ? `${base} (High-Index)` : base;
  }, [prescription, lensCatalog.lensTypes, chosenLensTypeId]);

  const handleStartSession = useCallback(() => {
    audioEngine.clearVoiceQueue();
    audioEngine.unlockAndPreload();
    setAdminKeyState('hidden');
    setAvatarTapCount(0);
    setPrivacyConsented(false);
    setStep('SCREEN_1B_PRIVACY_CONSENT');
  }, []);

  const handleAcceptPrivacyConsent = useCallback(() => {
    audioEngine.unlockAndPreload();
    setPrivacyConsented(true);
    setStep('SCREEN_2_RX_BUDGET');
  }, []);

  const handleContinueToScan = useCallback(() => {
    if (!privacyConsented) {
      setStep('SCREEN_1B_PRIVACY_CONSENT');
      return;
    }
    audioEngine.unlockAndPreload();
    setRxBudgetCompleted(true);
    setStep('SCREEN_3_FACE_SCAN');
  }, [privacyConsented]);

  const handleScanStageCue = useCallback((stage: FaceScanStage) => {
    if (stage === 2) {
      audioEngine.playLightDing();
    } else if (stage === 5) {
      audioEngine.playTwoNoteDing();
    }
  }, []);

  const handleScanSpeech = useCallback(
    (phrase: string, options?: { minRepeatCooldownMs?: number }) => {
      return audioEngine.speak(phrase, options);
    },
    []
  );

  const handleScanComplete = useCallback(
    (result: FacialScanResult) => {
      setScanResult(result);
      setActiveFaceShapeFilter(result.faceShape);
      setActiveOrganizeFilter('Most Accurate to Face Shape');

      const defaultCoats = lensCatalog.coatings
        .filter((c) => c.enabledByDefault)
        .map((c) => c.id);
      setChosenCoatingIds(defaultCoats);
      const firstEnabledLens = lensCatalog.lensTypes.find((l) => l.enabled);
      if (firstEnabledLens) setChosenLensTypeId(firstEnabledLens.id);

      setStep('SCREEN_3B_LOADING');
    },
    [lensCatalog]
  );

  const handleToggleCompare = useCallback((frameId: string) => {
    setCompareFrameIds((prev) => {
      if (prev.includes(frameId)) {
        return prev.filter((id) => id !== frameId);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), frameId];
      }
      return [...prev, frameId];
    });
  }, []);

  const handleSelectActiveTryOnFrame = useCallback(
    (frameId: string) => {
      const target = frames.find((f) => f.id === frameId);
      setChosenFrameId(frameId);
      if (target) {
        setChosenColor(target.availableColors[0] || target.color);
      }
    },
    [frames]
  );

  const handleTryOnFromShortlist = useCallback(
    (frameId: string) => {
      if (!rxBudgetCompleted || !scanResult) return;
      handleSelectActiveTryOnFrame(frameId);
      setCompareFrameIds((prev) => {
        if (prev.includes(frameId)) return prev;
        if (prev.length >= 3) return [frameId, ...prev.slice(0, 2)];
        return [frameId, ...prev];
      });
      setStep('SCREEN_5_TRY_ON');
    },
    [rxBudgetCompleted, scanResult, handleSelectActiveTryOnFrame]
  );

  const handleToggleFavorite = useCallback((frameId: string) => {
    setFavoriteFrameIds((prev) =>
      prev.includes(frameId) ? prev.filter((id) => id !== frameId) : [...prev, frameId]
    );
  }, []);

  const handleContinueToSummary = useCallback(
    (lensPrice: number, totalCost: number) => {
      if (!rxBudgetCompleted || !scanResult || !activeChosenFrame) return;
      setFinalLensPrice(lensPrice);
      setFinalTotalPrice(totalCost);
      setOrderNumber(String(Math.floor(100000 + Math.random() * 900000)));
      setStep('SCREEN_6_SUMMARY');
    },
    [rxBudgetCompleted, scanResult, activeChosenFrame]
  );

  const handleEndSession = useCallback(() => {
    if (scanResult && activeChosenFrame) {
      const today = new Date().toISOString().slice(0, 10);
      onRecordSessionComplete(
        {
          id: `ses-${Date.now()}`,
          date: today,
          framesTriedCount: Math.max(1, compareFrameIds.length),
          detectedFaceShape: scanResult.faceShape,
          favoritedFrameIds:
            favoriteFrameIds.length > 0 ? [...favoriteFrameIds] : [activeChosenFrame.id],
          selectedFrameId: activeChosenFrame.id,
          summaryPrintedOrSent: true,
        },
        activeChosenFrame.id
      );
    }
    resetSession();
  }, [
    scanResult,
    activeChosenFrame,
    compareFrameIds.length,
    favoriteFrameIds,
    onRecordSessionComplete,
    resetSession,
  ]);

  // Strict guard: do not render Screen 4/5/6 before Consent, Screen 2, & Screen 3 are complete
  const canViewCatalogStages = privacyConsented && rxBudgetCompleted && scanResult !== null;

  return (
    <div className="w-screen h-screen bg-[#E6F5FE] flex items-center justify-center overflow-hidden">
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
        className="relative shrink-0 bg-white shadow-[0_18px_60px_rgba(12,62,102,0.18)] overflow-hidden"
      >
        {step === 'SCREEN_1_WELCOME' && (
          <KioskScreen1Welcome
            onStartSession={handleStartSession}
            onAvatarTap={handleAvatarTap}
            adminKeyState={adminKeyState}
            onOpenAdminLogin={() => setAdminLoginOpen(true)}
          />
        )}

        {step === 'SCREEN_1B_PRIVACY_CONSENT' && (
          <KioskScreenPrivacyConsent
            onAgree={handleAcceptPrivacyConsent}
            onDecline={resetSession}
          />
        )}

        {step === 'SCREEN_2_RX_BUDGET' && privacyConsented && (
          <KioskScreen2RxBudget
            prescription={prescription}
            budgetPhp={budgetPhp}
            matchingFramesUnderBudget={matchingFramesUnderBudget}
            onChangePrescription={setPrescription}
            onChangeBudgetPhp={setBudgetPhp}
            onReturn={() => setStep('SCREEN_1B_PRIVACY_CONSENT')}
            onContinueToScan={handleContinueToScan}
          />
        )}

        {step === 'SCREEN_3_FACE_SCAN' && privacyConsented && rxBudgetCompleted && (
          <FaceScan
            onReturn={() => {
              audioEngine.clearVoiceQueue();
              setStep('SCREEN_2_RX_BUDGET');
            }}
            onComplete={handleScanComplete}
            onStageCue={handleScanStageCue}
            onStageSpeech={handleScanSpeech}
          />
        )}

        {step === 'SCREEN_3B_LOADING' && canViewCatalogStages && scanResult && (
          <KioskP16Processing
            scanResult={scanResult}
            prescription={prescription}
            budgetPhp={budgetPhp}
            onSketchReady={(asset) =>
              setScanResult((prev) =>
                prev
                  ? {
                      ...prev,
                      sketchFaceDataUrl: asset.sketchFaceDataUrl,
                      sketchWidth: asset.sketchWidth,
                      sketchHeight: asset.sketchHeight,
                      sketchLandmarks: asset.sketchLandmarks,
                    }
                  : prev
              )
            }
            onDone={() => setStep('SCREEN_4_SHORTLIST')}
          />
        )}

        {step === 'SCREEN_4_SHORTLIST' && canViewCatalogStages && scanResult && (
          <KioskScreen4Shortlist
            frames={frames}
            scanResult={scanResult}
            rulesEngine={rulesEngine}
            budgetPhp={budgetPhp}
            activeFaceShape={activeFaceShapeFilter}
            activeOrganize={activeOrganizeFilter}
            compareFrameIds={compareFrameIds}
            favoriteFrameIds={favoriteFrameIds}
            onApplyFilters={(fs, org) => {
              setActiveFaceShapeFilter(fs);
              setActiveOrganizeFilter(org);
            }}
            onToggleCompare={handleToggleCompare}
            onTryOnFrame={handleTryOnFromShortlist}
            onReturnToScan={() => setStep('SCREEN_3_FACE_SCAN')}
          />
        )}

        {step === 'SCREEN_5_TRY_ON' &&
          canViewCatalogStages &&
          scanResult &&
          activeChosenFrame && (
            <KioskScreen5TryOnCompare
              frames={frames}
              scanResult={scanResult}
              rulesEngine={rulesEngine}
              lensCatalog={lensCatalog}
              prescription={prescription}
              budgetPhp={budgetPhp}
              activeFrameId={activeChosenFrame.id}
              compareFrameIds={compareFrameIds}
              favoriteFrameIds={favoriteFrameIds}
              selectedColor={chosenColor || activeChosenFrame.color}
              selectedLensTypeId={chosenLensTypeId}
              selectedCoatingIds={chosenCoatingIds}
              onSelectActiveFrame={handleSelectActiveTryOnFrame}
              onAddCompareFrame={(id) =>
                setCompareFrameIds((prev) =>
                  prev.includes(id) || prev.length >= 3 ? prev : [...prev, id]
                )
              }
              onRemoveCompareFrame={(id) => {
                setCompareFrameIds((prev) => {
                  const next = prev.filter((x) => x !== id);
                  if (chosenFrameId === id && next[0]) {
                    handleSelectActiveTryOnFrame(next[0]);
                  }
                  return next;
                });
              }}
              onToggleFavorite={handleToggleFavorite}
              onChangeColor={setChosenColor}
              onChangeLensType={setChosenLensTypeId}
              onToggleCoating={(cid) =>
                setChosenCoatingIds((prev) =>
                  prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]
                )
              }
              onBackToCatalog={() => setStep('SCREEN_4_SHORTLIST')}
              onContinueToSummary={handleContinueToSummary}
            />
          )}

        {step === 'SCREEN_6_SUMMARY' &&
          canViewCatalogStages &&
          scanResult &&
          activeChosenFrame && (
            <KioskScreen6Summary
              orderNumber={orderNumber}
              scanResult={scanResult}
              frame={activeChosenFrame}
              selectedColor={chosenColor || activeChosenFrame.color}
              lensTypeName={activeLensTypeName}
              prescription={prescription}
              lensPrice={
                finalLensPrice ||
                getEstimatedLensPrice(
                  lensCatalog,
                  prescription,
                  chosenLensTypeId,
                  chosenCoatingIds
                )
              }
              totalPrice={finalTotalPrice || activeChosenFrame.price}
              favoriteCount={favoriteFrameIds.length}
              onBackToTryOn={() => setStep('SCREEN_5_TRY_ON')}
              onEndSession={handleEndSession}
            />
          )}

        {/* Admin Control Log-in Modal */}
        {adminLoginOpen && step === 'SCREEN_1_WELCOME' && (
          <AdminLoginView
            mode="modal"
            device="Kiosk-01"
            onClose={handleCloseAdminLoginModal}
            onRecordLog={(uname, res) => onRecordAccessLog(uname, 'Kiosk-01', res)}
            onSuccess={(staff) => {
              setAdminLoginOpen(false);
              setAdminKeyState('hidden');
              onAdminLoginSuccess(staff);
            }}
          />
        )}
      </div>
    </div>
  );
};
