import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import nodemailer from 'nodemailer';

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.json({ limit: '256kb' }));

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    })
  : null;

// In-memory + persistent /tmp disk cache of generated kiosk voice lines (keyed by text)
const ttsCache = new Map<string, string>();
const inFlightTts = new Map<string, Promise<{ audioBase64?: string; rateLimited?: boolean; retryAfterSeconds?: number; errorStatus?: number }>>();
const DISK_CACHE_DIR = path.join(os.tmpdir(), 'framefit-tts-cache');
try {
  fs.mkdirSync(DISK_CACHE_DIR, { recursive: true });
} catch {
  // ignore if tmp cache dir cannot be created
}

type TtsTone = 'warm' | 'excited';

function getCacheKey(text: string, tone: TtsTone): string {
  return `${tone}:${text}`;
}

function getCacheFilePath(text: string, tone: TtsTone): string {
  const hash = crypto
    .createHash('sha256')
    .update(`v5-friendly-robotic:${tone}:${text}`)
    .digest('hex');
  return path.join(DISK_CACHE_DIR, `${hash}.b64`);
}

function readCachedAudio(text: string, tone: TtsTone): string | null {
  const cacheKey = getCacheKey(text, tone);
  if (ttsCache.has(cacheKey)) {
    return ttsCache.get(cacheKey) || null;
  }
  try {
    const filePath = getCacheFilePath(text, tone);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8').trim();
      if (data) {
        ttsCache.set(cacheKey, data);
        return data;
      }
    }
  } catch {
    // ignore cache read error
  }
  return null;
}

function writeCachedAudio(text: string, tone: TtsTone, base64Audio: string): void {
  const cacheKey = getCacheKey(text, tone);
  if (ttsCache.size < 64) {
    ttsCache.set(cacheKey, base64Audio);
  }
  try {
    fs.writeFileSync(getCacheFilePath(text, tone), base64Audio, 'utf8');
  } catch {
    // ignore disk cache write failure
  }
}

// Serialize upstream Gemini TTS requests and respect 429 RetryInfo cooldowns
let ttsQueue: Promise<void> = Promise.resolve();
let rateLimitedUntilMs = 0;

function parseRetrySeconds(err: unknown): number {
  const raw = err instanceof Error ? err.message : String(err || '');
  const match = raw.match(/retry in\s+([\d.]+)s/i) || raw.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (match && match[1]) {
    return Math.max(5, Math.min(60, Math.ceil(Number(match[1]))));
  }
  return 15;
}

function isQuotaError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 429) return true;
  const msg = err instanceof Error ? err.message : String(err || '');
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
}

app.post('/api/tts', async (req, res) => {
  try {
    const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const tone: TtsTone = req.body?.tone === 'excited' ? 'excited' : 'warm';
    if (!rawText || rawText.length > 220) {
      res.status(400).json({ error: 'Invalid TTS text payload' });
      return;
    }

    const cached = readCachedAudio(rawText, tone);
    if (cached) {
      res.json({ audioBase64: cached, mimeType: 'audio/wav', cached: true });
      return;
    }

    if (!ai) {
      res.status(503).json({ error: 'TTS service unconfigured' });
      return;
    }

    const now = Date.now();
    if (now < rateLimitedUntilMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitedUntilMs - now) / 1000));
      res.status(429).json({ error: 'TTS quota cooldown active', retryAfterSeconds });
      return;
    }

    const cacheKey = getCacheKey(rawText, tone);
    let pending = inFlightTts.get(cacheKey);
    if (!pending) {
      pending = new Promise((resolve) => {
        ttsQueue = ttsQueue.then(async () => {
          const againCached = readCachedAudio(rawText, tone);
          if (againCached) {
            resolve({ audioBase64: againCached });
            return;
          }
          const tNow = Date.now();
          if (tNow < rateLimitedUntilMs) {
            resolve({
              rateLimited: true,
              retryAfterSeconds: Math.max(1, Math.ceil((rateLimitedUntilMs - tNow) / 1000)),
            });
            return;
          }

          try {
            const voiceStyle =
              tone === 'excited'
                ? 'Very friendly, warm, bright, and genuinely inviting human female host voice—speaking with a cheerful smile, melodic warmth, and welcoming energy as she invites the guest to try Frame-Fit'
                : 'Warm, friendly, cheerful, and approachable female kiosk host voice—clear, pleasant, and inviting';
            const response = await ai.models.generateContent({
              model: 'gemini-3.8-flash-lite-tts',
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: rawText,
                      speechMetadata: {
                        style: voiceStyle,
                      },
                    },
                  ],
                },
              ],
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: 'Aoede',
                    },
                  },
                },
              },
            });

            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!base64Audio) {
              resolve({ errorStatus: 502 });
              return;
            }

            writeCachedAudio(rawText, tone, base64Audio);
            resolve({ audioBase64: base64Audio });
          } catch (err) {
            if (isQuotaError(err)) {
              const retryAfterSeconds = parseRetrySeconds(err);
              rateLimitedUntilMs = Date.now() + retryAfterSeconds * 1000;
              console.warn(`TTS quota cooldown (${retryAfterSeconds}s); client falling back to Web Speech.`);
              resolve({ rateLimited: true, retryAfterSeconds });
            } else {
              console.warn('TTS upstream error:', err instanceof Error ? err.message : String(err));
              resolve({ errorStatus: 500 });
            }
          }
        });
      });

      inFlightTts.set(cacheKey, pending);
      pending.finally(() => inFlightTts.delete(cacheKey));
    }

    const result = await pending;
    if (result.audioBase64) {
      res.json({ audioBase64: result.audioBase64, mimeType: 'audio/wav' });
      return;
    }
    if (result.rateLimited) {
      res.status(429).json({
        error: 'TTS quota cooldown active',
        retryAfterSeconds: result.retryAfterSeconds ?? 15,
      });
      return;
    }
    res.status(result.errorStatus || 500).json({ error: 'Failed to synthesize voice audio' });
  } catch (err) {
    console.warn('TTS route error:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Failed to synthesize voice audio' });
  }
});

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanField(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.replace(/[\r\n\0]/g, ' ').trim().slice(0, maxLen) || fallback;
}

app.post('/api/send-receipt', express.json({ limit: '4mb' }), async (req, res) => {
  try {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (
      !rawEmail ||
      rawEmail.length > 254 ||
      /[\r\n]/.test(rawEmail) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail)
    ) {
      res.status(400).json({ sent: false, error: 'Invalid recipient email address' });
      return;
    }

    const orderNumber = cleanField(req.body?.orderNumber, 24, '000000');
    const customerName = cleanField(req.body?.customerName, 120, 'Guest');
    const faceShapeLabel = cleanField(req.body?.faceShapeLabel, 60, 'Oval Face Shape');
    const frameName = cleanField(req.body?.frameName, 120, 'Selected Frame');
    const selectedColor = cleanField(req.body?.selectedColor, 80, 'Standard');
    const lensTypeName = cleanField(req.body?.lensTypeName, 80, 'Single Vision');
    const prescriptionSummary = cleanField(req.body?.prescriptionSummary, 160, 'None');
    const totalFormatted = cleanField(req.body?.totalFormatted, 40, '₱0.00');

    let pdfBuffer: Buffer | null = null;
    if (typeof req.body?.pdfBase64 === 'string' && req.body.pdfBase64.length > 0) {
      const normalized = req.body.pdfBase64.replace(/^data:application\/pdf;base64,/, '').trim();
      if (normalized.length <= 3_000_000 && /^[A-Za-z0-9+/=]+$/.test(normalized)) {
        pdfBuffer = Buffer.from(normalized, 'base64');
      }
    }

    const smtpHost = process.env.SMTP_HOST?.trim();
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();
    const parsedPort = Number(process.env.SMTP_PORT);
    const smtpPort =
      Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535
        ? parsedPort
        : 587;
    const smtpFrom = process.env.SMTP_FROM?.trim() || smtpUser || 'no-reply@framefit-kiosk.local';

    if (!smtpHost || !smtpUser || !smtpPass) {
      res.status(200).json({
        sent: false,
        configured: false,
        message: 'Configure SMTP_HOST, SMTP_USER, and SMTP_PASS in server secrets to email receipts.',
      });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number.isFinite(smtpPort) ? smtpPort : 587,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const safeOrderFile = orderNumber.replace(/[^a-zA-Z0-9_-]/g, '') || 'receipt';
    const textBody = [
      'FRAME-FIT Order Summary Receipt',
      `Order No. ${orderNumber}`,
      `Name: ${customerName}`,
      `Face Shape: ${faceShapeLabel}`,
      `Model: ${frameName}`,
      `Color: ${selectedColor}`,
      `Lens Type: ${lensTypeName}`,
      `Lens Grade: ${prescriptionSummary}`,
      `Total: ${totalFormatted}`,
      '',
      'Present this summary receipt to the counter to process your order.',
    ].join('\n');

    const htmlBody = `
      <div style="font-family:'JetBrains Mono',Consolas,monospace;max-width:440px;margin:0 auto;background:#F9FBFE;border:1.5px solid #E2ECF5;border-radius:24px;padding:28px;color:#000000;">
        <div style="text-align:center;margin-bottom:18px;">
          <div style="display:inline-block;background:#3BBEFF;color:#FFFFFF;font-weight:800;font-size:20px;padding:8px 18px;border-radius:12px;letter-spacing:0.5px;">FRAME-FIT</div>
        </div>
        <div style="font-size:16px;margin-bottom:10px;"><strong>Name:</strong> ${escapeHtml(customerName)}</div>
        <div style="text-align:center;font-weight:700;color:#176BA8;font-size:17px;margin:10px 0;">Order No. ${escapeHtml(orderNumber)}</div>
        <div style="text-align:center;font-size:16px;margin-bottom:10px;">${escapeHtml(faceShapeLabel)}</div>
        <div style="font-size:16px;margin-bottom:12px;"><strong>Model:</strong> ${escapeHtml(frameName)}</div>
        <hr style="border:none;border-top:2px solid #B8C2CC;margin:14px 0;" />
        <div style="font-size:15px;line-height:1.7;">
          <div>Color: ${escapeHtml(selectedColor)}</div>
          <div>Lens Type: ${escapeHtml(lensTypeName)}</div>
          <div>Lens Grade: ${escapeHtml(prescriptionSummary)}</div>
        </div>
        <hr style="border:none;border-top:2px solid #B8C2CC;margin:14px 0;" />
        <div style="font-size:22px;font-weight:700;">${escapeHtml(totalFormatted)}</div>
      </div>
    `;

    await transporter.sendMail({
      from: smtpFrom,
      to: rawEmail,
      subject: `Frame-Fit Order Summary Receipt — Order No. ${orderNumber}`,
      text: textBody,
      html: htmlBody,
      attachments: pdfBuffer
        ? [
            {
              filename: `FrameFit-Receipt-${safeOrderFile}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ]
        : [],
    });

    res.json({ sent: true, configured: true });
  } catch (err) {
    console.warn('Receipt email delivery error:', err instanceof Error ? err.message : String(err));
    res.status(502).json({ sent: false, error: 'Failed to send receipt email' });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Frame-Fit Kiosk Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
