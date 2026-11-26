import { jsPDF } from 'jspdf';
import { FACE_SHAPE_META } from '../data/initialData';
import { CustomerPrescription, FaceShape, FrameItem } from '../types/framefit';
import { formatPhp, formatPrescriptionSummary } from './recommendation';

export interface ReceiptPdfInput {
  orderNumber: string;
  faceShape: FaceShape;
  frame: FrameItem;
  selectedColor: string;
  lensTypeName: string;
  prescription: CustomerPrescription;
  framePrice: number;
  lensPrice: number;
  totalPrice: number;
}

export interface GeneratedReceiptPdf {
  filename: string;
  pdfBase64: string;
  blobUrl: string;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawFrameFitLogo(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number
) {
  const scale = (138 * 0.72) / 220;
  ctx.save();
  ctx.translate(centerX - (220 * scale) / 2, topY);
  ctx.scale(scale, scale);

  drawRoundedRectPath(ctx, 4, 4, 212, 88, 16);
  ctx.fillStyle = '#3BBEFF';
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#2BA7EB';
  ctx.fill(new Path2D('M110 38 L88 86 L132 86 Z'));
  ctx.restore();

  ctx.fillStyle = '#FFFFFF';
  ctx.fill(
    new Path2D(
      'M12 18 C12 12 20 10 56 10 C82 10 92 16 100 26 C104 31 116 31 120 26 C128 16 138 10 164 10 C200 10 208 12 208 18 L206 32 C201 35 198 46 196 58 C192 78 176 86 154 86 C132 86 121 75 118 55 C116 42 104 42 102 55 C99 75 88 86 66 86 C44 86 28 78 24 58 C22 46 19 35 14 32 Z'
    )
  );

  drawRoundedRectPath(ctx, 20, 19, 12, 4, 2);
  ctx.fillStyle = '#3BBEFF';
  ctx.fill();
  drawRoundedRectPath(ctx, 188, 19, 12, 4, 2);
  ctx.fill();

  ctx.fill(
    new Path2D(
      'M32 25 C42 20 75 20 88 26 C95 30 96 42 94 55 C91 70 80 78 64 78 C46 78 34 70 31 54 C28 40 27 28 32 25 Z'
    )
  );
  ctx.fill(
    new Path2D(
      'M188 25 C178 20 145 20 132 26 C125 30 124 42 126 55 C129 70 140 78 156 78 C174 78 186 70 189 54 C192 40 193 28 188 25 Z'
    )
  );

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(62, 49, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(158, 49, 19, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  ctx.fillStyle = '#3BBEFF';
  ctx.font = '800 19.5px "Rubik", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('FRAME-FIT', centerX, topY + 96 * scale + 2);
}

function drawFaceShapeIcon(
  ctx: CanvasRenderingContext2D,
  shape: FaceShape,
  color: string,
  x: number,
  y: number,
  size = 20
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y);

  switch (shape) {
    case 'Oval': {
      const sx = size / 32;
      const sy = size / 24;
      ctx.scale(sx, sy);
      ctx.beginPath();
      ctx.ellipse(16, 12, 14, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'Round': {
      const s = size / 24;
      ctx.scale(s, s);
      ctx.beginPath();
      ctx.arc(12, 12, 10, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'Square': {
      const s = size / 24;
      ctx.scale(s, s);
      drawRoundedRectPath(ctx, 2, 2, 20, 20, 1.5);
      ctx.fill();
      break;
    }
    case 'Heart': {
      const s = size / 24;
      ctx.scale(s, s);
      ctx.fill(
        new Path2D(
          'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
        )
      );
      break;
    }
    case 'Diamond': {
      const s = size / 24;
      ctx.scale(s, s);
      ctx.fill(new Path2D('M12,1 L22,12 L12,23 L2,12 Z'));
      break;
    }
    case 'Oblong': {
      const sx = size / 32;
      const sy = size / 24;
      ctx.scale(sx, sy);
      drawRoundedRectPath(ctx, 2, 4, 28, 16, 8);
      ctx.fill();
      break;
    }
    case 'Triangle': {
      const s = size / 24;
      ctx.scale(s, s);
      ctx.fill(new Path2D('M12,2 L22,21 L2,21 Z'));
      break;
    }
  }

  ctx.restore();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function truncateTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}...`;
}

export async function generateReceiptPdf(
  input: ReceiptPdfInput
): Promise<GeneratedReceiptPdf> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // proceed with loaded font stack
    }
  }

  const shapeMeta = FACE_SHAPE_META[input.faceShape];
  const rxSummary = formatPrescriptionSummary(input.prescription);
  const framePriceText = formatPhp(input.framePrice);
  const lensPriceText = formatPhp(input.lensPrice);
  const totalPriceText = formatPhp(input.totalPrice);
  const fulfillmentText =
    input.frame.stock > 0
      ? 'Ready for Pickup'
      : 'Made-to-Order (Supplier Order Required)';

  const cardW = 468;
  const cardH = 620;
  const dpr = 3;
  const monoFont = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

  const canvas = document.createElement('canvas');
  canvas.width = cardW * dpr;
  canvas.height = cardH * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create PDF receipt canvas context');
  }

  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cardW, cardH);

  // Classic Frame-Fit Receipt Card container (#F9FBFE fill + #E2ECF5 1.5px border + 28px radius)
  drawRoundedRectPath(ctx, 1, 1, cardW - 2, cardH - 2, 28);
  ctx.fillStyle = '#F9FBFE';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#E2ECF5';
  ctx.stroke();

  const padX = 32;
  const innerW = cardW - padX * 2;

  // 1. FrameFit Logo
  drawFrameFitLogo(ctx, cardW / 2, 24);

  // 2. Order No. (anonymous session number — no customer name printed)
  let y = 114;
  ctx.font = `700 20px ${monoFont}`;
  ctx.fillStyle = '#176BA8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`Order No. ${input.orderNumber}`, cardW / 2, y);

  // 3. Face Shape Label + Colored Icon
  y += 38;
  ctx.font = `500 18px ${monoFont}`;
  ctx.fillStyle = '#000000';
  const labelW = ctx.measureText(shapeMeta.label).width;
  const iconSize = 19;
  const iconGap = 10;
  const rowTotalW = labelW + iconGap + iconSize;
  const rowStartX = (cardW - rowTotalW) / 2;
  ctx.textAlign = 'left';
  ctx.fillText(shapeMeta.label, rowStartX, y);
  drawFaceShapeIcon(
    ctx,
    input.faceShape,
    shapeMeta.color,
    rowStartX + labelW + iconGap,
    y + 1,
    iconSize
  );

  // 4. Model: <frame.name>
  y += 40;
  ctx.font = `600 18px ${monoFont}`;
  ctx.fillStyle = '#000000';
  const modelPrefix = 'Model: ';
  ctx.fillText(modelPrefix, padX, y);
  const modelPrefixW = ctx.measureText(modelPrefix).width;
  ctx.font = `500 18px ${monoFont}`;
  const fittedModel = truncateTextToWidth(ctx, input.frame.name, innerW - modelPrefixW);
  ctx.fillText(fittedModel, padX + modelPrefixW, y);

  // Divider 1 (#B8C2CC, 2px)
  y += 38;
  ctx.strokeStyle = '#B8C2CC';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(cardW - padX, y);
  ctx.stroke();

  // 5. Color / Lens Type / Lens Grade / Shelf Location / Fulfillment Method
  y += 20;
  ctx.fillStyle = '#000000';
  ctx.font = `400 16.5px ${monoFont}`;
  ctx.fillText(
    truncateTextToWidth(ctx, `Color: ${input.selectedColor}`, innerW),
    padX,
    y
  );

  y += 30;
  ctx.fillText(
    truncateTextToWidth(ctx, `Lens Type: ${input.lensTypeName}`, innerW),
    padX,
    y
  );

  y += 30;
  ctx.font = `400 15px ${monoFont}`;
  const gradeLines = wrapTextLines(ctx, `Lens Grade: ${rxSummary}`, innerW).slice(0, 2);
  for (const line of gradeLines) {
    ctx.fillText(line, padX, y);
    y += 22;
  }

  y += 8;
  ctx.font = `600 16.5px ${monoFont}`;
  ctx.fillStyle = '#176BA8';
  ctx.fillText(
    truncateTextToWidth(ctx, `Shelf Location: ${input.frame.shelfLocation}`, innerW),
    padX,
    y
  );

  y += 28;
  ctx.font = `600 14.5px ${monoFont}`;
  ctx.fillStyle = input.frame.stock > 0 ? '#186A14' : '#B84E00';
  ctx.fillText(
    truncateTextToWidth(ctx, `Fulfillment: ${fulfillmentText}`, innerW),
    padX,
    y
  );

  // Breakdown lines above final total
  const div2Y = Math.max(y + 38, cardH - 154);
  ctx.strokeStyle = '#B8C2CC';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, div2Y);
  ctx.lineTo(cardW - padX, div2Y);
  ctx.stroke();

  ctx.font = `400 15px ${monoFont}`;
  ctx.fillStyle = '#4C555E';
  ctx.fillText('Frame:', padX, div2Y + 14);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#000000';
  ctx.fillText(framePriceText, cardW - padX, div2Y + 14);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#4C555E';
  ctx.fillText('Lenses:', padX, div2Y + 38);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#000000';
  ctx.fillText(lensPriceText, cardW - padX, div2Y + 38);

  // 6. Estimated Total Price
  ctx.textAlign = 'left';
  ctx.font = `700 18px ${monoFont}`;
  ctx.fillStyle = '#1A5878';
  ctx.fillText('Est. Total:', padX, div2Y + 72);

  ctx.textAlign = 'right';
  ctx.font = `700 24px ${monoFont}`;
  ctx.fillStyle = '#000000';
  ctx.fillText(totalPriceText, cardW - padX, div2Y + 69);

  // Footer associate handoff note
  ctx.textAlign = 'center';
  ctx.font = `500 13px ${monoFont}`;
  ctx.fillStyle = '#5B6570';
  ctx.fillText('Show this summary to the Sales Associate.', cardW / 2, cardH - 36);

  // Embed crystal-clear 300-DPI receipt card inside PDF document
  const imgDataUrl = canvas.toDataURL('image/png');
  const margin = 24;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: [cardW + margin * 2, cardH + margin * 2],
    compress: true,
  });

  doc.addImage(imgDataUrl, 'PNG', margin, margin, cardW, cardH, undefined, 'FAST');

  const dataUri = doc.output('datauristring');
  const pdfBase64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
  const pdfBlob = doc.output('blob');
  const blobUrl = URL.createObjectURL(pdfBlob);
  const safeOrder = input.orderNumber.replace(/[^a-zA-Z0-9_-]/g, '') || 'receipt';

  return {
    filename: `FrameFit-Receipt-${safeOrder}.pdf`,
    pdfBase64,
    blobUrl,
  };
}

export function triggerReceiptPdfDownload(blobUrl: string, filename: string): void {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
