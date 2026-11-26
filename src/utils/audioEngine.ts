// Web Audio API sound effects & metallic-robotic female AI voice queue engine

export type TtsTone = 'warm' | 'excited';

export const HOME_WELCOME_PHRASE =
  'Welcome, to Frame-Fit. Where you wear what matches your glare.';

export const KIOSK_VOICE_LINES = [
  'Looking for your face now...',
  'Great, I see you! Hold steady for a moment.',
  'Measuring your facial proportions...',
  'Tracing your face shape now...',
  'Thank you for using Frame-Fit!',
  'See you again soon!',
  'Opening the Admin Interface...',
  'Welcome to the Admin Interface!',
] as const;

type Listener = (muted: boolean) => void;

export interface SpeechMouthState {
  speaking: boolean;
  phrase: string | null;
  openness: number;
  jawOpen: number;
  upperLift: number;
  lipWidth: number;
  tongueLift: number;
  teethShow: number;
}

class FrameFitAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private listeners = new Set<Listener>();

  private rawAudioCache = new Map<string, ArrayBuffer>();
  private rawFetchPromises = new Map<string, Promise<ArrayBuffer | null>>();
  private ttsEndpointUnavailable = false;
  private rateLimitUntilMs = 0;
  private dripTimer: number | null = null;
  private dripIndex = 0;

  // Decoded AudioBuffers keyed by `${tone}:${text}`
  private bufferCache = new Map<string, AudioBuffer>();
  private decodePromises = new Map<string, Promise<AudioBuffer | null>>();

  // Strict FIFO speech queue so lines never overlap
  private speechQueue: Array<{ text: string; tone: TtsTone; resolve: () => void }> = [];
  private isSpeaking = false;
  private currentPhrase: string | null = null;
  private lastSpokenAt = new Map<string, number>();
  private speechGen = 0;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeRingOsc: OscillatorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBins: Uint8Array<ArrayBuffer> | null = null;
  private analyserFreqBins: Uint8Array<ArrayBuffer> | null = null;
  private fallbackSpeaking = false;
  private fallbackText = '';
  private fallbackEstimatedMs = 3600;
  private fallbackCharIndex = 0;
  private fallbackStartedAt = 0;
  private fallbackSawBoundary = false;
  private fallbackPulse = 0;
  private fallbackPulseAt = 0;
  private activeSfxStops = new Set<() => void>();
  private queueGapTimer: number | null = null;

  private getLineKey(text: string, tone: TtsTone): string {
    return `${tone}:${text}`;
  }

  private visemeFromChar(ch: string): {
    jaw: number;
    upper: number;
    width: number;
    tongue: number;
    teeth: number;
  } {
    const c = ch.toLowerCase();
    if ('mbp'.includes(c)) return { jaw: 0.04, upper: 0.02, width: -0.08, tongue: 0.05, teeth: 0.0 };
    if ('fv'.includes(c)) return { jaw: 0.16, upper: 0.18, width: 0.15, tongue: 0.1, teeth: 0.65 };
    if ('wuoq'.includes(c)) return { jaw: 0.38, upper: 0.18, width: -0.58, tongue: 0.15, teeth: 0.1 };
    if ('ltdnr'.includes(c)) return { jaw: 0.34, upper: 0.24, width: 0.14, tongue: 0.72, teeth: 0.38 };
    if ('szc'.includes(c)) return { jaw: 0.18, upper: 0.22, width: 0.38, tongue: 0.34, teeth: 0.58 };
    if ('ei'.includes(c)) return { jaw: 0.44, upper: 0.42, width: 0.56, tongue: 0.38, teeth: 0.48 };
    if ('ay'.includes(c)) return { jaw: 0.72, upper: 0.46, width: 0.22, tongue: 0.28, teeth: 0.38 };
    if ('gk'.includes(c)) return { jaw: 0.36, upper: 0.2, width: 0.08, tongue: 0.45, teeth: 0.2 };
    return { jaw: 0.08, upper: 0.05, width: 0.0, tongue: 0.08, teeth: 0.05 };
  }

  public getSpeechMouthState(): SpeechMouthState {
    const silent: SpeechMouthState = {
      speaking: false,
      phrase: null,
      openness: 0,
      jawOpen: 0,
      upperLift: 0,
      lipWidth: 0,
      tongueLift: 0,
      teethShow: 0,
    };
    if (!this.isSpeaking || this.muted) {
      return silent;
    }

    // 1. Live Web Audio waveform + formant bands when Gemini TTS AudioBuffer is playing
    if (this.analyser && this.analyserBins && this.analyserFreqBins) {
      this.analyser.getByteTimeDomainData(this.analyserBins);
      this.analyser.getByteFrequencyData(this.analyserFreqBins);

      let sumSq = 0;
      const len = this.analyserBins.length;
      for (let i = 0; i < len; i++) {
        const sample = (this.analyserBins[i] - 128) / 128;
        sumSq += sample * sample;
      }
      const rms = Math.sqrt(sumSq / len);
      const linearEnergy = Math.min(1, Math.max(0, (rms - 0.009) * 7.8));
      const energy = Math.pow(linearEnergy, 0.72);

      // Average low (F1 jaw ~180-750Hz), mid (F2 spread/tongue ~900-2500Hz), high (fricatives ~2.8-6kHz)
      let lowSum = 0;
      for (let i = 1; i <= 4; i++) lowSum += this.analyserFreqBins[i] || 0;
      const lowEnergy = lowSum / (4 * 255);

      let midSum = 0;
      for (let i = 5; i <= 13; i++) midSum += this.analyserFreqBins[i] || 0;
      const midEnergy = midSum / (9 * 255);

      let highSum = 0;
      for (let i = 15; i <= 32; i++) highSum += this.analyserFreqBins[i] || 0;
      const highEnergy = highSum / (18 * 255);

      const vowelBalance = lowEnergy / (lowEnergy + highEnergy + 0.05);
      const jawOpen = Math.min(0.95, energy * (0.56 + vowelBalance * 0.48));
      const lipWidth = Math.max(
        -0.7,
        Math.min(0.88, energy * ((midEnergy - lowEnergy * 0.7) * 2.8 + 0.16))
      );
      const upperLift = Math.min(0.9, energy * (0.36 + midEnergy * 0.64));
      const tongueLift = Math.min(
        0.92,
        energy * Math.max(0, (midEnergy * 0.7 + highEnergy * 0.8 - lowEnergy * 0.18) * 1.55)
      );
      const teethShow = Math.min(0.95, energy * (0.38 + highEnergy * 0.85 + midEnergy * 0.36));

      return {
        speaking: true,
        phrase: this.currentPhrase,
        openness: jawOpen,
        jawOpen,
        upperLift,
        lipWidth,
        tongueLift,
        teethShow,
      };
    }

    // 2. Web Speech character-viseme + boundary cadence fallback
    if (this.fallbackSpeaking) {
      const now = performance.now();
      const elapsedMs = Math.max(0, now - this.fallbackStartedAt);
      const text = this.fallbackText || this.currentPhrase || '';
      const progressIdx = Math.min(
        Math.max(0, text.length - 1),
        Math.floor((elapsedMs / Math.max(1200, this.fallbackEstimatedMs)) * text.length)
      );
      const activeIdx = this.fallbackSawBoundary
        ? Math.min(Math.max(0, text.length - 1), this.fallbackCharIndex)
        : progressIdx;
      const ch = text[activeIdx] || ' ';
      const viseme = this.visemeFromChar(ch);

      const pulseAgeSec = Math.max(0, (now - this.fallbackPulseAt) / 1000);
      const env = this.fallbackSawBoundary
        ? Math.max(0.32, this.fallbackPulse * Math.exp(-pulseAgeSec * 4.0))
        : 0.78 + 0.22 * Math.sin((elapsedMs / 1000) * 10.5);
      const commaPause =
        !this.fallbackSawBoundary && (ch === ',' || ch === '.') ? 0.1 : 1.0;

      const jawOpen = Math.min(0.92, viseme.jaw * 1.15 * env * commaPause);
      return {
        speaking: true,
        phrase: this.currentPhrase,
        openness: jawOpen,
        jawOpen,
        upperLift: Math.min(0.9, viseme.upper * 1.15 * env * commaPause),
        lipWidth: viseme.width * env,
        tongueLift: Math.min(0.9, viseme.tongue * 1.1 * env * commaPause),
        teethShow: Math.min(0.92, viseme.teeth * 1.1 * env * commaPause),
      };
    }

    return { ...silent, speaking: true, phrase: this.currentPhrase };
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(next: boolean): void {
    this.muted = next;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(next ? 0 : 0.92, this.ctx.currentTime, 0.02);
    }
    if (next) {
      this.clearVoiceQueue();
    }
    this.listeners.forEach((fn) => fn(this.muted));
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public subscribeMute(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.92;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Prepares audio subsystem on KioskFlow mount without bursting free-tier RPM quota
  public preloadAudioAssets(): void {
    // Actual TTS warm-up starts drip-by-drip upon first user interaction via unlockAndPreload()
  }

  private scheduleNextDrip(delayMs: number): void {
    if (typeof window === 'undefined' || this.dripTimer !== null) return;
    if (this.ttsEndpointUnavailable || this.dripIndex >= KIOSK_VOICE_LINES.length) return;

    this.dripTimer = window.setTimeout(() => {
      this.dripTimer = null;
      if (this.ttsEndpointUnavailable || this.dripIndex >= KIOSK_VOICE_LINES.length) return;

      const waitCooldown = this.rateLimitUntilMs - Date.now();
      if (waitCooldown > 0) {
        this.scheduleNextDrip(waitCooldown + 500);
        return;
      }

      const line = KIOSK_VOICE_LINES[this.dripIndex++];
      void this.loadTtsBuffer(line, 'warm').finally(() => {
        // Space uncached requests >= 21s apart to stay strictly within 3 RPM free-tier quota
        const wasCached = this.rawAudioCache.has(this.getLineKey(line, 'warm'));
        this.scheduleNextDrip(wasCached ? 250 : 21500);
      });
    }, delayMs);
  }

  // Call on first user gesture (P1 Proceed / P10 Proceed) to unlock Web Audio & drip-preload TTS lines
  public unlockAndPreload(): void {
    this.ensureContext();
    if (this.ttsEndpointUnavailable) return;

    // Decode any already-cached lines immediately
    if (
      this.rawAudioCache.has(this.getLineKey(HOME_WELCOME_PHRASE, 'excited')) &&
      !this.bufferCache.has(this.getLineKey(HOME_WELCOME_PHRASE, 'excited'))
    ) {
      void this.loadTtsBuffer(HOME_WELCOME_PHRASE, 'excited');
    }
    for (const line of KIOSK_VOICE_LINES) {
      const key = this.getLineKey(line, 'warm');
      if (this.rawAudioCache.has(key) && !this.bufferCache.has(key)) {
        void this.loadTtsBuffer(line, 'warm');
      }
    }

    // Prioritize excited home welcome greeting first if not yet cached, then start scan-line drip
    const welcomeKey = this.getLineKey(HOME_WELCOME_PHRASE, 'excited');
    const needsWelcomeFetch = !this.rawAudioCache.has(welcomeKey);
    if (needsWelcomeFetch && Date.now() >= this.rateLimitUntilMs) {
      void this.loadTtsBuffer(HOME_WELCOME_PHRASE, 'excited');
    }

    if (this.dripIndex < KIOSK_VOICE_LINES.length && this.dripTimer === null) {
      this.scheduleNextDrip(needsWelcomeFetch ? 21500 : 2500);
    }
  }

  private async fetchRawAudio(text: string, tone: TtsTone = 'warm'): Promise<ArrayBuffer | null> {
    if (this.ttsEndpointUnavailable) return null;
    const key = this.getLineKey(text, tone);
    if (this.rawAudioCache.has(key)) {
      return this.rawAudioCache.get(key) || null;
    }
    if (Date.now() < this.rateLimitUntilMs) {
      return null;
    }
    const existing = this.rawFetchPromises.get(key);
    if (existing) return existing;

    const task = (async (): Promise<ArrayBuffer | null> => {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, tone }),
        });
        if (res.status === 503) {
          this.ttsEndpointUnavailable = true;
          return null;
        }
        if (res.status === 429) {
          let retrySec = 15;
          try {
            const payload = (await res.json()) as { retryAfterSeconds?: number };
            if (typeof payload.retryAfterSeconds === 'number') {
              retrySec = payload.retryAfterSeconds;
            }
          } catch {
            // ignore json parse error
          }
          this.rateLimitUntilMs = Date.now() + retrySec * 1000;
          return null;
        }
        if (!res.ok) return null;
        const data = (await res.json()) as { audioBase64?: string };
        if (!data.audioBase64) return null;

        const binStr = atob(data.audioBase64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        const buf = bytes.buffer;
        this.rawAudioCache.set(key, buf);
        return buf;
      } catch {
        return null;
      } finally {
        if (!this.rawAudioCache.has(key)) {
          this.rawFetchPromises.delete(key);
        }
      }
    })();

    this.rawFetchPromises.set(key, task);
    return task;
  }

  private async loadTtsBuffer(text: string, tone: TtsTone = 'warm'): Promise<AudioBuffer | null> {
    const key = this.getLineKey(text, tone);
    if (this.bufferCache.has(key)) {
      return this.bufferCache.get(key) || null;
    }
    const existing = this.decodePromises.get(key);
    if (existing) return existing;

    const task = (async (): Promise<AudioBuffer | null> => {
      try {
        const raw = await this.fetchRawAudio(text, tone);
        if (!raw) return null;
        const ctx = this.ensureContext();
        if (!ctx) return null;
        const decoded = await ctx.decodeAudioData(raw.slice(0));
        this.bufferCache.set(key, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        if (!this.bufferCache.has(key)) {
          this.decodePromises.delete(key);
        }
      }
    })();

    this.decodePromises.set(key, task);
    return task;
  }

  public clearVoiceQueue(): void {
    this.speechGen += 1;
    if (this.queueGapTimer !== null) {
      window.clearTimeout(this.queueGapTimer);
      this.queueGapTimer = null;
    }
    const pending = this.speechQueue.splice(0, this.speechQueue.length);
    pending.forEach((item) => item.resolve());

    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
        // ignore already stopped
      }
      this.activeSource = null;
    }
    if (this.activeRingOsc) {
      try {
        this.activeRingOsc.stop();
        this.activeRingOsc.disconnect();
      } catch {
        // ignore
      }
      this.activeRingOsc = null;
    }
    this.activeSfxStops.forEach((stop) => {
      try {
        stop();
      } catch {
        // ignore
      }
    });
    this.activeSfxStops.clear();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    this.analyser = null;
    this.analyserBins = null;
    this.analyserFreqBins = null;
    this.fallbackSpeaking = false;
    this.fallbackText = '';
    this.fallbackCharIndex = 0;
    this.currentPhrase = null;
    this.isSpeaking = false;
  }

  public speak(
    text: string,
    options?: { minRepeatCooldownMs?: number; tone?: TtsTone }
  ): Promise<void> {
    if (this.muted) return Promise.resolve();
    const tone: TtsTone = options?.tone ?? 'warm';
    const cooldown = options?.minRepeatCooldownMs ?? 0;
    if (cooldown > 0) {
      const prevAt = this.lastSpokenAt.get(text) ?? 0;
      if (Date.now() - prevAt < cooldown) {
        return Promise.resolve();
      }
    }
    // Never enqueue duplicate phrase if currently playing or already queued
    if (
      this.currentPhrase === text ||
      this.speechQueue.some((item) => item.text === text)
    ) {
      return Promise.resolve();
    }

    this.ensureContext();
    return new Promise((resolve) => {
      this.speechQueue.push({ text, tone, resolve });
      if (!this.isSpeaking && this.queueGapTimer === null) {
        void this.pumpQueue();
      }
    });
  }

  private async pumpQueue(): Promise<void> {
    if (this.isSpeaking) return;
    const next = this.speechQueue.shift();
    if (!next) return;

    this.isSpeaking = true;
    this.currentPhrase = next.text;
    const myGen = this.speechGen;

    try {
      if (!this.muted) {
        this.lastSpokenAt.set(next.text, Date.now());
        const buffer = await this.loadTtsBuffer(next.text, next.tone);
        if (myGen === this.speechGen && !this.muted) {
          let playedBuffer = false;
          if (buffer) {
            playedBuffer = await this.playWithMetallicChain(buffer, myGen);
          }
          if (!playedBuffer && myGen === this.speechGen && !this.muted) {
            await this.playWebSpeechFallback(next.text, myGen, next.tone, buffer?.duration);
          }
        }
      }
    } catch {
      // ignore playback failure
    } finally {
      next.resolve();
      this.currentPhrase = null;
      this.isSpeaking = false;
      if (this.speechQueue.length > 0 && myGen === this.speechGen) {
        // Calm 1.5s pause before next queued utterance so lines never sound rushed
        this.queueGapTimer = window.setTimeout(() => {
          this.queueGapTimer = null;
          if (myGen === this.speechGen && !this.isSpeaking && this.speechQueue.length > 0) {
            void this.pumpQueue();
          }
        }, 1500);
      }
    }
  }

  // Friendly, inviting female vocal core blended with a clean metallic-robotic AI comb + shimmer filter
  private async playWithMetallicChain(buffer: AudioBuffer, gen: number): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || gen !== this.speechGen) {
      return false;
    }

    if (ctx.state === 'suspended') {
      try {
        await Promise.race([
          ctx.resume(),
          new Promise<void>((res) => window.setTimeout(res, 140)),
        ]);
      } catch {
        // ignore resume error before user gesture
      }
    }

    if (ctx.state !== 'running' || gen !== this.speechGen) {
      return false;
    }

    return new Promise((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      this.activeSource = source;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 115;

      const warmth = ctx.createBiquadFilter();
      warmth.type = 'peaking';
      warmth.frequency.value = 260;
      warmth.Q.value = 0.9;
      warmth.gain.value = 1.6;

      const clarity = ctx.createBiquadFilter();
      clarity.type = 'peaking';
      clarity.frequency.value = 2850;
      clarity.Q.value = 1.1;
      clarity.gain.value = 2.2;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 9000;

      // Primary warm human-friendly core (keeps warmth, smile, and clear intelligibility)
      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.74;

      // Robotic Layer 1: Twin short metallic comb resonators (holographic AI timber)
      const combFilter = ctx.createBiquadFilter();
      combFilter.type = 'bandpass';
      combFilter.frequency.value = 1750;
      combFilter.Q.value = 1.25;

      const combDelayA = ctx.createDelay(0.05);
      combDelayA.delayTime.value = 0.0082;
      const combFbA = ctx.createGain();
      combFbA.gain.value = 0.36;

      const combDelayB = ctx.createDelay(0.05);
      combDelayB.delayTime.value = 0.0138;
      const combFbB = ctx.createGain();
      combFbB.gain.value = 0.32;

      const combWet = ctx.createGain();
      combWet.gain.value = 0.24;

      // Robotic Layer 2: Subtle high-clarity harmonic ring-modulator shimmer (215Hz pure sine)
      const ringBand = ctx.createBiquadFilter();
      ringBand.type = 'bandpass';
      ringBand.frequency.value = 1450;
      ringBand.Q.value = 1.05;

      const ringModGain = ctx.createGain();
      ringModGain.gain.value = 0;

      const ringOsc = ctx.createOscillator();
      ringOsc.type = 'sine';
      ringOsc.frequency.value = 215;
      this.activeRingOsc = ringOsc;

      const ringDepth = ctx.createGain();
      ringDepth.gain.value = 1.0;

      const ringWet = ctx.createGain();
      ringWet.gain.value = 0.085;

      // Output mix -> AnalyserNode (drives real-time lip-sync) -> masterGain
      const mixBus = ctx.createGain();
      mixBus.gain.value = 1.0;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.45;
      this.analyser = analyser;
      this.analyserBins = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      this.analyserFreqBins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

      source.connect(hp);
      hp.connect(warmth);
      warmth.connect(clarity);
      clarity.connect(lp);

      // Dry friendly path
      lp.connect(dryGain);
      dryGain.connect(mixBus);

      // Metallic comb resonator path
      lp.connect(combFilter);
      combFilter.connect(combDelayA);
      combDelayA.connect(combFbA);
      combFbA.connect(combDelayA);
      combDelayA.connect(combWet);

      combFilter.connect(combDelayB);
      combDelayB.connect(combFbB);
      combFbB.connect(combDelayB);
      combDelayB.connect(combWet);

      combWet.connect(mixBus);

      // Subtle robotic harmonic shimmer path
      lp.connect(ringBand);
      ringBand.connect(ringModGain);
      ringOsc.connect(ringDepth);
      ringDepth.connect(ringModGain.gain);
      ringModGain.connect(ringWet);
      ringWet.connect(mixBus);

      mixBus.connect(analyser);
      analyser.connect(this.masterGain!);

      let finished = false;
      let safetyTimer = 0;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        if (safetyTimer) window.clearTimeout(safetyTimer);
        try {
          ringOsc.stop();
          ringOsc.disconnect();
        } catch {
          // ignore
        }
        try {
          source.disconnect();
          analyser.disconnect();
          mixBus.disconnect();
        } catch {
          // ignore
        }
        if (this.activeSource === source) this.activeSource = null;
        if (this.analyser === analyser) {
          this.analyser = null;
          this.analyserBins = null;
          this.analyserFreqBins = null;
        }
        if (this.activeRingOsc === ringOsc) this.activeRingOsc = null;
        resolve(true);
      };

      safetyTimer = window.setTimeout(
        cleanup,
        Math.ceil((buffer.duration + 1.5) * 1000)
      );
      source.onended = cleanup;
      ringOsc.start();
      source.start();
    });
  }

  private async playWebSpeechFallback(
    text: string,
    gen: number,
    tone: TtsTone = 'warm',
    knownDurationSec?: number
  ): Promise<void> {
    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      gen !== this.speechGen ||
      this.muted
    ) {
      return;
    }

    // Wait briefly if browser hasn't populated SpeechSynthesis voices yet
    let voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      await new Promise<void>((res) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.speechSynthesis.removeEventListener?.('voiceschanged', finish);
          res();
        };
        window.speechSynthesis.addEventListener?.('voiceschanged', finish);
        window.setTimeout(finish, 320);
      });
      voices = window.speechSynthesis.getVoices();
    }

    if (gen !== this.speechGen || this.muted) return;

    const isMaleName = (name: string) =>
      /\bmale\b|\bdavid\b|\bmark\b|\bdaniel\b|\balex\b|\bfred\b|\bgeorge\b|\bpaul\b|\bguy\b|\bryan\b|\bjorge\b|\bmateo\b|\baaron\b|\bthomas\b|\boliver\b|\brishi\b|\bjames\b|\brobert\b|\bmichael\b|\bwilliam\b|\bchris\b|\bryan\b|\bevan\b/i.test(
        name
      );
    const isNaturalWarmFemale = (name: string) =>
      /aria|jenny|sonia|samantha|ava|allison|serena|claire|emma|joanna|natural|online|google uk english female|google us english/i.test(
        name
      );
    const isFemaleName = (name: string) =>
      /\bfemale\b|samantha|victoria|karen|zira|aria|jenny|sonia|libby|susan|hazel|catherine|serena|moira|tessa|fiona|veena|ava|allison|kate|natasha|claire|emma|amy|joanna|kimberly|kendra|salli|ivy|google uk english female|google us english/i.test(
        name
      );

    const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    const femaleVoice =
      englishVoices.find((v) => isNaturalWarmFemale(v.name) && !isMaleName(v.name)) ||
      englishVoices.find((v) => isFemaleName(v.name) && !isMaleName(v.name)) ||
      voices.find((v) => isFemaleName(v.name) && !isMaleName(v.name)) ||
      englishVoices.find((v) => !isMaleName(v.name)) ||
      null;

    const estimatedMs = Math.min(
      6800,
      Math.max(3100, Math.round((knownDurationSec ?? Math.max(3.6, text.length * 0.072)) * 1000))
    );

    this.fallbackSpeaking = true;
    this.fallbackText = text;
    this.fallbackEstimatedMs = estimatedMs;
    this.fallbackCharIndex = 0;
    this.fallbackStartedAt = performance.now();
    this.fallbackSawBoundary = false;
    this.fallbackPulse = 0.84;
    this.fallbackPulseAt = this.fallbackStartedAt;

    const clauses =
      tone === 'excited' && text.includes('. ')
        ? text
            .split(/(?<=\.)\s+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [text];

    let charOffset = 0;
    for (let cIdx = 0; cIdx < clauses.length; cIdx++) {
      if (gen !== this.speechGen || this.muted) break;
      const clauseText = clauses[cIdx];
      const clauseEstMs = Math.max(
        1400,
        Math.round((estimatedMs * clauseText.length) / Math.max(1, text.length))
      );

      await new Promise<void>((resolve) => {
        const utter = new SpeechSynthesisUtterance(clauseText);
        if (femaleVoice) {
          utter.voice = femaleVoice;
          utter.pitch = tone === 'excited' ? (cIdx === 0 ? 1.15 : 1.11) : 1.05;
        } else {
          // Ensure warm expressive female vocal register if OS exposes only generic default voice
          utter.pitch = tone === 'excited' ? (cIdx === 0 ? 1.28 : 1.23) : 1.22;
        }
        utter.rate = tone === 'excited' ? (cIdx === 0 ? 0.96 : 0.93) : 0.96;

        let settled = false;
        let started = false;

        const finish = (cancelledByTimeout: boolean) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(safety);
          if (cancelledByTimeout && !started) {
            try {
              window.speechSynthesis.cancel();
            } catch {
              // ignore
            }
          }
          resolve();
        };

        const safety = window.setTimeout(() => finish(true), clauseEstMs);

        utter.onstart = () => {
          started = true;
          this.fallbackCharIndex = charOffset;
          this.fallbackPulse = 0.92;
          this.fallbackPulseAt = performance.now();
        };
        utter.onboundary = (event) => {
          this.fallbackSawBoundary = true;
          if (typeof event.charIndex === 'number') {
            this.fallbackCharIndex = charOffset + event.charIndex;
          }
          this.fallbackPulse = 0.9 + Math.random() * 0.1;
          this.fallbackPulseAt = performance.now();
        };
        utter.onend = () => finish(false);
        utter.onerror = () => finish(false);

        try {
          window.speechSynthesis.resume();
          window.speechSynthesis.speak(utter);
        } catch {
          finish(false);
        }
      });

      charOffset += clauseText.length + 1;
      if (cIdx < clauses.length - 1 && gen === this.speechGen && !this.muted) {
        await new Promise<void>((r) => window.setTimeout(r, 150));
      }
    }

    this.fallbackSpeaking = false;
    this.fallbackText = '';
    this.fallbackCharIndex = 0;
  }

  // Slide 9: Light "ding" bell on Face Detected
  public playLightDing(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const partials = [
      { freq: 1174.66, amp: 0.28, decay: 0.48 },
      { freq: 2349.32, amp: 0.11, decay: 0.32 },
    ];
    for (const p of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(p.amp, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + p.decay);
      osc.connect(gain);
      gain.connect(this.masterGain);
      const stopFn = () => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // ignore
        }
      };
      this.activeSfxStops.add(stopFn);
      osc.onended = () => this.activeSfxStops.delete(stopFn);
      osc.start(now);
      osc.stop(now + p.decay + 0.04);
    }
  }

  // Slide 12: Bright two-note rising ding on Facial Scan Complete
  public playTwoNoteDing(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const notes = [
      { freq: 880.0, overtone: 1760.0, start: 0, dur: 0.36 },
      { freq: 1318.51, overtone: 2637.02, start: 0.13, dur: 0.62 },
    ];

    for (const n of notes) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(n.freq, now + n.start);
      osc2.frequency.setValueAtTime(n.overtone, now + n.start);

      const g2 = ctx.createGain();
      g2.gain.value = 0.22;

      gain.gain.setValueAtTime(0.001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.32, now + n.start + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + n.start + n.dur);

      osc1.connect(gain);
      osc2.connect(g2);
      g2.connect(gain);
      gain.connect(this.masterGain);

      const stopFn = () => {
        try {
          osc1.stop();
          osc2.stop();
          osc1.disconnect();
          osc2.disconnect();
        } catch {
          // ignore
        }
      };
      this.activeSfxStops.add(stopFn);
      osc1.onended = () => this.activeSfxStops.delete(stopFn);

      osc1.start(now + n.start);
      osc2.start(now + n.start);
      osc1.stop(now + n.start + n.dur + 0.04);
      osc2.stop(now + n.start + n.dur + 0.04);
    }
  }

  // Slide 15: Realistic thermal receipt-printer sound (~1.5s rhythmic bursts + ticks + paper cut)
  public playPrinterSound(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    // Generate short white-noise buffer
    const duration = 1.48;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2600;
    filter.Q.value = 1.1;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);

    // 7 thermal print line bursts + stepper cadence
    const lineCount = 7;
    const tickOscs: OscillatorNode[] = [];
    for (let i = 0; i < lineCount; i++) {
      const t = now + i * 0.18;
      env.gain.setValueAtTime(0.02, t);
      env.gain.linearRampToValueAtTime(0.16, t + 0.03);
      env.gain.linearRampToValueAtTime(0.03, t + 0.13);

      // Stepper tick pulse
      const tickOsc = ctx.createOscillator();
      const tickGain = ctx.createGain();
      tickOsc.type = 'square';
      tickOsc.frequency.setValueAtTime(340 + (i % 2) * 35, t);
      tickGain.gain.setValueAtTime(0.07, t);
      tickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      tickOsc.connect(tickGain);
      tickGain.connect(this.masterGain);
      tickOsc.start(t);
      tickOsc.stop(t + 0.04);
      tickOscs.push(tickOsc);
    }

    // Crisp tear/cut snap at the end
    const cutTime = now + 1.32;
    env.gain.setValueAtTime(0.24, cutTime);
    env.gain.exponentialRampToValueAtTime(0.001, cutTime + 0.12);

    noiseSrc.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);

    const stopFn = () => {
      try {
        noiseSrc.stop();
        noiseSrc.disconnect();
      } catch {
        // ignore
      }
      tickOscs.forEach((o) => {
        try {
          o.stop();
          o.disconnect();
        } catch {
          // ignore
        }
      });
    };
    this.activeSfxStops.add(stopFn);
    noiseSrc.onended = () => this.activeSfxStops.delete(stopFn);

    noiseSrc.start(now);
    noiseSrc.stop(now + duration);
  }

  // Slide 15: Satisfying warm completion chime when Receipt Printed! appears
  public playCompletionChime(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const chord = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    chord.forEach((freq, idx) => {
      const t = now + idx * 0.075;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.72);
      osc.connect(gain);
      gain.connect(this.masterGain!);

      const stopFn = () => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // ignore
        }
      };
      this.activeSfxStops.add(stopFn);
      osc.onended = () => this.activeSfxStops.delete(stopFn);

      osc.start(t);
      osc.stop(t + 0.76);
    });
  }

  // Opening screen hidden Admin trigger: 0.38s "pop-glitch" sound effect
  public playPopGlitchSfx(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    // 1) Crisp pitch-drop "pop"
    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();
    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(560, now);
    popOsc.frequency.exponentialRampToValueAtTime(115, now + 0.085);
    popGain.gain.setValueAtTime(0.001, now);
    popGain.gain.exponentialRampToValueAtTime(0.32, now + 0.008);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    popOsc.connect(popGain);
    popGain.connect(this.masterGain);

    // 2) Short digital glitch bursts (filtered noise + stepped square chirp)
    const noiseLen = Math.floor(ctx.sampleRate * 0.24);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    // Stepped sample-and-hold bitcrushed texture
    let hold = 0;
    for (let i = 0; i < noiseLen; i++) {
      if (i % 14 === 0) hold = Math.random() * 2 - 1;
      ch[i] = hold;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3100, now + 0.07);
    bp.frequency.setValueAtTime(4600, now + 0.19);
    bp.Q.value = 1.6;

    const glitchGain = ctx.createGain();
    glitchGain.gain.setValueAtTime(0.0001, now);
    // Stutter burst A
    glitchGain.gain.setValueAtTime(0.16, now + 0.075);
    glitchGain.gain.setValueAtTime(0.001, now + 0.13);
    // Stutter burst B
    glitchGain.gain.setValueAtTime(0.19, now + 0.175);
    glitchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.245);

    noiseSrc.connect(bp);
    bp.connect(glitchGain);
    glitchGain.connect(this.masterGain);

    // 3) Brief electronic chirp settle
    const chirpOsc = ctx.createOscillator();
    const chirpGain = ctx.createGain();
    chirpOsc.type = 'square';
    chirpOsc.frequency.setValueAtTime(1420, now + 0.08);
    chirpOsc.frequency.setValueAtTime(890, now + 0.14);
    chirpOsc.frequency.setValueAtTime(1780, now + 0.2);
    chirpGain.gain.setValueAtTime(0.0001, now);
    chirpGain.gain.setValueAtTime(0.055, now + 0.08);
    chirpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    chirpOsc.connect(chirpGain);
    chirpGain.connect(this.masterGain);

    const stopFn = () => {
      for (const n of [popOsc, noiseSrc, chirpOsc]) {
        try {
          n.stop();
          n.disconnect();
        } catch {
          // ignore
        }
      }
    };
    this.activeSfxStops.add(stopFn);
    chirpOsc.onended = () => this.activeSfxStops.delete(stopFn);

    popOsc.start(now);
    popOsc.stop(now + 0.11);
    noiseSrc.start(now + 0.07);
    noiseSrc.stop(now + 0.26);
    chirpOsc.start(now + 0.08);
    chirpOsc.stop(now + 0.36);
  }

  // Stage 4 Phase 4B: Subtle, realistic optical sweep SFX during top-to-bottom scan line slide
  public playScanSlideSfx(durationSec = 1.42): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    // Gentle filtered optical air/servo sweep
    const bufLen = Math.floor(ctx.sampleRate * durationSec);
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufLen; i++) {
      // Soft pink-ish smoothed noise for silky optical scan texture
      const white = Math.random() * 2 - 1;
      last = last * 0.82 + white * 0.18;
      ch[i] = last;
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3.2;
    bp.frequency.setValueAtTime(1450, now);
    bp.frequency.exponentialRampToValueAtTime(680, now + durationSec);

    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, now);
    airGain.gain.linearRampToValueAtTime(0.048, now + 0.14);
    airGain.gain.setValueAtTime(0.044, now + durationSec - 0.22);
    airGain.gain.exponentialRampToValueAtTime(0.0005, now + durationSec);

    noiseSrc.connect(bp);
    bp.connect(airGain);
    airGain.connect(this.masterGain);

    // Subtle soft sine-triangle tracking glide underneath
    const glideOsc = ctx.createOscillator();
    glideOsc.type = 'sine';
    glideOsc.frequency.setValueAtTime(460, now);
    glideOsc.frequency.exponentialRampToValueAtTime(280, now + durationSec);

    const glideGain = ctx.createGain();
    glideGain.gain.setValueAtTime(0.0001, now);
    glideGain.gain.linearRampToValueAtTime(0.026, now + 0.15);
    glideGain.gain.setValueAtTime(0.024, now + durationSec - 0.24);
    glideGain.gain.exponentialRampToValueAtTime(0.0005, now + durationSec);

    glideOsc.connect(glideGain);
    glideGain.connect(this.masterGain);

    const stopFn = () => {
      for (const n of [noiseSrc, glideOsc]) {
        try {
          n.stop();
          n.disconnect();
        } catch {
          // ignore
        }
      }
    };
    this.activeSfxStops.add(stopFn);
    glideOsc.onended = () => this.activeSfxStops.delete(stopFn);

    noiseSrc.start(now);
    noiseSrc.stop(now + durationSec + 0.02);
    glideOsc.start(now);
    glideOsc.stop(now + durationSec + 0.02);
  }

  // Stage 4 Phase 4C: Three understated tactile optical shutter/lock ticks aligned with the 3 white flickers
  public playScanFlickerSfx(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const pulses = [
      { offset: 0.03, freq: 940, gain: 0.045, dur: 0.065 },
      { offset: 0.29, freq: 1080, gain: 0.05, dur: 0.065 },
      { offset: 0.55, freq: 1240, gain: 0.06, dur: 0.1 },
    ];

    const nodes: AudioScheduledSourceNode[] = [];

    for (const p of pulses) {
      const t = now + p.offset;

      // Delicate pure pulse tone
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, t);
      g.gain.setValueAtTime(0.0005, t);
      g.gain.linearRampToValueAtTime(p.gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0005, t + p.dur);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + p.dur + 0.015);
      nodes.push(osc);

      // Tiny 10ms soft relay micro-click
      const clickLen = Math.floor(ctx.sampleRate * 0.012);
      const clickBuf = ctx.createBuffer(1, clickLen, ctx.sampleRate);
      const cData = clickBuf.getChannelData(0);
      for (let i = 0; i < clickLen; i++) {
        cData[i] = (Math.random() * 2 - 1) * (1 - i / clickLen);
      }
      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = clickBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 2600;
      hp.Q.value = 2.4;
      const cg = ctx.createGain();
      cg.gain.value = 0.032;
      clickSrc.connect(hp);
      hp.connect(cg);
      cg.connect(this.masterGain);
      clickSrc.start(t);
      clickSrc.stop(t + 0.014);
      nodes.push(clickSrc);
    }

    const lastOsc = nodes[nodes.length - 2];
    const stopFn = () => {
      for (const n of nodes) {
        try {
          n.stop();
          n.disconnect();
        } catch {
          // ignore
        }
      }
    };
    this.activeSfxStops.add(stopFn);
    if (lastOsc) {
      lastOsc.onended = () => this.activeSfxStops.delete(stopFn);
    }
  }
}

export const audioEngine = new FrameFitAudioEngine();
