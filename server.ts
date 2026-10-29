/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp, { type Metadata, type OutputInfo } from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Body parser with 15MB limit for base64 image uploads
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// SQLite Database Setup
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'food_freshness.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    food_category TEXT NOT NULL,
    freshness_classification TEXT NOT NULL,
    confidence_score REAL NOT NULL,
    visible_indicators TEXT NOT NULL,
    explanation TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_version TEXT NOT NULL,
    image_data TEXT,
    cv_metrics TEXT
  );
`);

// Shared Gemini client setup (with bounded timeout & single retry so 503 spikes fail over fast)
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = geminiApiKey
  ? new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        timeout: 15000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const VALID_INDICATORS = [
  'Discoloration',
  'Dark spots',
  'Wrinkles or shriveling',
  'Mold-like patterns',
  'Surface breakdown',
] as const;

export type FreshnessClassification = 'Fresh' | 'Aging' | 'Visibly Spoiled';

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImageError';
  }
}

export interface CVAnalysisResult {
  foodCategory: string;
  categoryConfidence: number;
  freshnessClassification: FreshnessClassification;
  freshnessConfidence: number;
  classProbabilities: {
    Fresh: number;
    Aging: number;
    'Visibly Spoiled': number;
  };
  visibleIndicators: string[];
  explanation: string;
  cvMetrics: {
    darkSpotAreaPercent: number;
    browningNecrosisPercent: number;
    moldIndicatorPercent: number;
    surfaceRoughnessScore: number;
    analyzedBytes: number;
    foregroundCoveragePercent: number;
    aspectRatio: number;
    dominantHue: number;
  };
}

export function normalizeFreshnessLabel(raw: unknown): FreshnessClassification {
  const s = String(raw || '').trim().toLowerCase();
  if (
    s === 'visibly spoiled' ||
    s === 'spoiled' ||
    s === 'rotten' ||
    s === 'moldy' ||
    s === 'decayed'
  ) {
    return 'Visibly Spoiled';
  }
  if (
    s === 'aging' ||
    s === 'moderately fresh' ||
    s === 'slightly aging' ||
    s === 'senescent' ||
    s === 'overripe'
  ) {
    return 'Aging';
  }
  return 'Fresh';
}

function sanitizeIndicators(
  rawIndicators: unknown,
  freshness: FreshnessClassification
): string[] {
  if (!Array.isArray(rawIndicators)) return [];
  const normalized: string[] = [];

  for (const item of rawIndicators) {
    const text = String(item || '').trim().toLowerCase();
    if (!text || text === 'none' || text === 'n/a' || text.includes('no visible')) {
      continue;
    }
    if (text.includes('discolor') || text.includes('brown')) {
      if (!normalized.includes('Discoloration')) normalized.push('Discoloration');
    } else if (text.includes('dark spot') || text.includes('black spot') || text.includes('lesion')) {
      if (!normalized.includes('Dark spots')) normalized.push('Dark spots');
    } else if (text.includes('wrinkl') || text.includes('shrivel') || text.includes('wilting')) {
      if (!normalized.includes('Wrinkles or shriveling')) normalized.push('Wrinkles or shriveling');
    } else if (text.includes('mold') || text.includes('mycelium') || text.includes('fungal')) {
      if (!normalized.includes('Mold-like patterns')) normalized.push('Mold-like patterns');
    } else if (text.includes('breakdown') || text.includes('rot') || text.includes('necrosis')) {
      if (!normalized.includes('Surface breakdown')) normalized.push('Surface breakdown');
    } else {
      const exact = VALID_INDICATORS.find((v) => v.toLowerCase() === text);
      if (exact && !normalized.includes(exact)) normalized.push(exact);
    }
  }

  // Ensure consistency: items genuinely classified as Fresh do not carry severe spoilage indicators
  if (freshness === 'Fresh') {
    return normalized.filter(
      (ind) => ind !== 'Mold-like patterns' && ind !== 'Surface breakdown'
    );
  }
  return normalized;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rNorm) h = ((gNorm - bNorm) / delta) % 6;
    else if (max === gNorm) h = (bNorm - rNorm) / delta + 2;
    else h = (rNorm - gNorm) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return [h, s, v];
}

/**
 * Validates that buffer is a genuine, decodable raster image (JPEG, PNG, or WEBP),
 * composites any alpha transparency onto neutral studio white (preventing transparent
 * PNG backgrounds from turning into black necrosis), auto-orients EXIF rotation,
 * and extracts foreground-segmented optical defect features.
 */
export async function classifyFoodWithComputerVision(buffer: Buffer): Promise<CVAnalysisResult> {
  const byteLength = buffer.length;

  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch (err: any) {
    throw new InvalidImageError(
      `Invalid or corrupted image file: ${err?.message || 'unable to decode image header'}`
    );
  }

  const allowedFormats = new Set(['jpeg', 'png', 'webp']);
  if (!meta.format || !allowedFormats.has(meta.format)) {
    throw new InvalidImageError(
      `Unsupported or invalid image format (${meta.format || 'unknown'}). Please upload a valid JPG, PNG, or WEBP image.`
    );
  }
  if (!meta.width || !meta.height || meta.width < 16 || meta.height < 16) {
    throw new InvalidImageError(
      'Image dimensions are too small for optical inspection (minimum 16x16 pixels).'
    );
  }

  let rawResult: { data: Buffer; info: OutputInfo };
  try {
    rawResult = await sharp(buffer)
      .rotate() // Respect EXIF orientation
      .flatten({ background: { r: 248, g: 250, b: 252 } }) // Composite alpha onto neutral studio white
      .resize(224, 224, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (err: any) {
    throw new InvalidImageError(
      `Corrupted image pixel stream: ${err?.message || 'failed to decode image data'}`
    );
  }

  const { data, info } = rawResult;
  const W = info.width;
  const H = info.height;
  const totalPixels = W * H;
  const origAspect = W / Math.max(1, H);

  // 1. Sample 3px 4-edge perimeter border to estimate background color
  const borderR: number[] = [];
  const borderG: number[] = [];
  const borderB: number[] = [];
  const borderBand = Math.max(2, Math.min(4, Math.floor(Math.min(W, H) * 0.03)));

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x < borderBand || x >= W - borderBand || y < borderBand || y >= H - borderBand) {
        const idx = (y * W + x) * 3;
        borderR.push(data[idx]);
        borderG.push(data[idx + 1]);
        borderB.push(data[idx + 2]);
      }
    }
  }

  const median = (arr: number[]): number => {
    if (arr.length === 0) return 245;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const bgR = median(borderR);
  const bgG = median(borderG);
  const bgB = median(borderB);
  const [, bgS, bgV] = rgbToHsv(bgR, bgG, bgB);
  const isLightNeutralBg = bgS < 0.16 && bgV > 0.72;

  // Precompute per-pixel luminance and HSV
  const lumArr = new Float32Array(totalPixels);
  const hueArr = new Uint16Array(totalPixels);
  const satArr = new Float32Array(totalPixels);
  const valArr = new Float32Array(totalPixels);
  const fgMask = new Uint8Array(totalPixels);

  let fgCount = 0;
  let minX = W, maxX = 0, minY = H, maxY = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const idx = p * 3;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const [h, s, v] = rgbToHsv(r, g, b);

      lumArr[p] = lum;
      hueArr[p] = h;
      satArr[p] = s;
      valArr[p] = v;

      const distToBg = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
      const isWhiteBackdrop = v > 0.92 && s < 0.10;
      const isBlackBorder =
        v < 0.06 && (x < 6 || x >= W - 6 || y < 6 || y >= H - 6);
      // Exclude neutral studio drop shadows on light backgrounds (e.g. rgba(0,0,0,0.08..0.28) -> gray s < 0.12)
      const isNeutralDropShadow =
        isLightNeutralBg &&
        s < 0.12 &&
        v >= 0.52 &&
        v <= 0.94 &&
        Math.abs(r - g) <= 12 &&
        Math.abs(g - b) <= 12 &&
        distToBg < 105;

      if (distToBg < 36 || isWhiteBackdrop || isBlackBorder || isNeutralDropShadow) {
        continue;
      }

      fgMask[p] = 1;
      fgCount++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Fallback if entire frame is filled with close-up food (border was the food itself!)
  if (fgCount < totalPixels * 0.04) {
    let saturatedPixels = 0;
    for (let p = 0; p < totalPixels; p++) {
      if (satArr[p] > 0.22 && valArr[p] > 0.12 && valArr[p] < 0.94) {
        fgMask[p] = 1;
        saturatedPixels++;
      }
    }
    if (saturatedPixels >= totalPixels * 0.08) {
      fgCount = saturatedPixels;
      minX = 0;
      maxX = W - 1;
      minY = 0;
      maxY = H - 1;
    }
  }

  const fgCoverage = totalPixels > 0 ? fgCount / totalPixels : 0;
  if (fgCount < totalPixels * 0.03) {
    return {
      foodCategory: 'Unknown or unsupported category',
      categoryConfidence: 32.0,
      freshnessClassification: 'Fresh',
      freshnessConfidence: 52.0,
      classProbabilities: { Fresh: 0.52, Aging: 0.30, 'Visibly Spoiled': 0.18 },
      visibleIndicators: [],
      explanation:
        'The uploaded image contains insufficient distinct food foreground pixels to perform reliable classification.',
      cvMetrics: {
        darkSpotAreaPercent: 0,
        browningNecrosisPercent: 0,
        moldIndicatorPercent: 0,
        surfaceRoughnessScore: 0,
        analyzedBytes: byteLength,
        foregroundCoveragePercent: +(fgCoverage * 100).toFixed(1),
        aspectRatio: +origAspect.toFixed(2),
        dominantHue: 0,
      },
    };
  }

  const fgWidth = Math.max(1, maxX - minX + 1);
  const fgHeight = Math.max(1, maxY - minY + 1);
  const boxArea = fgWidth * fgHeight;
  const boxFillRatio = fgCount / Math.max(1, boxArea);
  const elongation = Math.max(fgWidth / fgHeight, fgHeight / fgWidth);

  // 2. Build eroded interior skin mask (erode by 2-3px so anti-aliased silhouette edges
  // and thin stems don't pollute skin necrosis or roughness metrics, while preserving thin curved fruit like bananas)
  const erodeRadius = Math.min(fgWidth, fgHeight) < 85 || boxFillRatio < 0.55 ? 2 : 3;
  const innerMask = new Uint8Array(totalPixels);
  let innerCount = 0;
  for (let y = erodeRadius; y < H - erodeRadius; y++) {
    for (let x = erodeRadius; x < W - erodeRadius; x++) {
      const p = y * W + x;
      if (!fgMask[p]) continue;
      let allFg = true;
      for (let dy = -erodeRadius; dy <= erodeRadius && allFg; dy++) {
        for (let dx = -erodeRadius; dx <= erodeRadius; dx++) {
          if (!fgMask[(y + dy) * W + (x + dx)]) {
            allFg = false;
            break;
          }
        }
      }
      if (allFg) {
        innerMask[p] = 1;
        innerCount++;
      }
    }
  }

  // If object is very thin, fall back to fgMask
  const skinMask = innerCount >= 100 ? innerMask : fgMask;
  const skinCount = innerCount >= 100 ? innerCount : fgCount;

  // 3. Gather healthy color distribution & median luminance across skin pixels
  const skinLums: number[] = [];
  let redCount = 0,
    crimsonCount = 0,
    yellowCount = 0,
    orangeCount = 0,
    greenCount = 0,
    topGreenCount = 0,
    earthenCount = 0;
  let sinHueSum = 0,
    cosHueSum = 0,
    chromaticCount = 0;

  const crownLimitY = minY + fgHeight * 0.28;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (!fgMask[p]) continue;
      const h = hueArr[p];
      const s = satArr[p];
      const v = valArr[p];
      const lum = lumArr[p];
      const bNorm = data[p * 3 + 2] / 255;

      if (skinMask[p]) {
        skinLums.push(lum);
      }

      if (s > 0.20 && v > 0.18) {
        const rad = (h * Math.PI) / 180;
        sinHueSum += Math.sin(rad);
        cosHueSum += Math.cos(rad);
        chromaticCount++;
      }

      if ((h >= 342 || h <= 16) && s > 0.35 && v > 0.20) redCount++;
      if ((h >= 348 || h <= 12) && s > 0.58 && v > 0.32) crimsonCount++;
      if (h >= 16 && h <= 37 && s > 0.58 && v > 0.42 && bNorm < 0.32) orangeCount++;
      if (h >= 38 && h <= 68 && s > 0.32 && v > 0.38) yellowCount++;
      if (h >= 69 && h <= 162 && s > 0.22 && v > 0.16) {
        greenCount++;
        if (y <= crownLimitY) topGreenCount++;
      }
      if (
        h >= 18 &&
        h <= 46 &&
        v >= 0.22 &&
        v <= 0.85 &&
        ((s >= 0.18 && s <= 0.72 && bNorm >= 0.08) || (s >= 0.35 && lum < 142))
      ) {
        earthenCount++;
      }
    }
  }

  const medianSkinLum = median(skinLums);
  let dominantHue = 0;
  if (chromaticCount > 0) {
    dominantHue = Math.round((Math.atan2(sinHueSum, cosHueSum) * 180) / Math.PI);
    if (dominantHue < 0) dominantHue += 360;
  }

  const redRatio = redCount / fgCount;
  const crimsonRatio = crimsonCount / fgCount;
  const orangeRatio = orangeCount / fgCount;
  const yellowRatio = yellowCount / fgCount;
  const greenRatio = greenCount / fgCount;
  const topGreenRatio = topGreenCount / fgCount;
  const earthenRatio = earthenCount / fgCount;

  // 4. Multi-class Food Category Estimation
  const scores: Record<string, number> = {
    Banana: 0,
    Tomato: 0,
    Apple: 0,
    Potato: 0,
    Orange: 0,
    Carrot: 0,
    Strawberry: 0,
    'Bell Pepper': 0,
    Cucumber: 0,
  };

  // Banana: curved (lower bounding-box fill) or elongated + yellow dominant
  if (yellowRatio >= 0.24) {
    scores.Banana += 50;
    if (elongation >= 1.35 || boxFillRatio < 0.62) scores.Banana += 38;
  }

  // Spherical geometry bonus
  if (elongation <= 1.26 && boxFillRatio >= 0.58) {
    scores.Tomato += 28;
    scores.Apple += 28;
    scores.Orange += 28;
  }

  // Tomato vs Apple vs Strawberry
  if (redRatio >= 0.25 || crimsonRatio >= 0.22) {
    if (crimsonRatio >= 0.28 && greenRatio >= 0.04 && greenRatio <= 0.22 && elongation > 1.15 && elongation <= 1.65 && fgHeight > fgWidth) {
      scores.Strawberry += 78;
    }
    if (greenRatio >= 0.015 && greenRatio <= 0.18) {
      scores.Apple += 54;
      scores.Tomato += 54;
    } else {
      scores.Tomato += 54;
      scores.Apple += 52;
    }
    // Deep ruby/crimson shading + rounder aspect is classic red apple; oblate width + crown calyx/scarlet lean is classic tomato
    if (dominantHue >= 352 || dominantHue <= 4) {
      scores.Apple += 9;
    } else if (dominantHue >= 6 && dominantHue <= 17) {
      scores.Tomato += 10;
    }
    if (fgWidth / fgHeight >= 1.06) {
      scores.Tomato += 11;
      if (topGreenRatio >= 0.02) scores.Tomato += 4;
    } else if (fgHeight / fgWidth >= 0.96 && greenRatio < 0.045) {
      scores.Apple += 6;
    }
  }

  // Green Apple vs Green Bell Pepper vs Cucumber
  if (greenRatio >= 0.35 && redRatio < 0.12) {
    if (elongation >= 1.95) {
      scores.Cucumber += 85;
    } else if (boxFillRatio >= 0.76 && elongation <= 1.48) {
      scores['Bell Pepper'] += 82;
    } else if (elongation <= 1.38) {
      scores.Apple += 75;
    }
  }

  // Red / Yellow Bell Pepper (blocky silhouette)
  if (boxFillRatio >= 0.80 && elongation <= 1.48 && (redRatio >= 0.50 || yellowRatio >= 0.50)) {
    scores['Bell Pepper'] += 80;
  }

  // Orange vs Carrot
  if (orangeRatio >= 0.25) {
    if (elongation >= 1.85) {
      scores.Carrot += 88;
    } else if (elongation <= 1.24) {
      scores.Orange += 86;
    } else {
      scores.Orange += 58;
    }
  }

  // Potato: oval + earthen amber/tan without strong red/green/bright-yellow
  if (
    elongation >= 1.24 &&
    elongation <= 1.82 &&
    earthenRatio >= 0.30 &&
    redRatio < 0.15 &&
    greenRatio < 0.12 &&
    yellowRatio < 0.25 &&
    medianSkinLum < 145
  ) {
    scores.Potato += 86;
  } else if (earthenRatio >= 0.35 && redRatio < 0.15 && greenRatio < 0.15 && yellowRatio < 0.25 && orangeRatio < 0.45) {
    scores.Potato += 82;
  }

  let bestCategory = 'Unknown or unsupported category';
  let maxScore = 0;
  for (const [cat, sc] of Object.entries(scores)) {
    if (sc > maxScore) {
      maxScore = sc;
      bestCategory = cat;
    }
  }
  if (maxScore < 48) {
    bestCategory = 'Unknown or unsupported category';
  }
  const categoryConfidence = Math.min(96.0, Math.max(45.0, maxScore));

  // Determine whether orange/tan hue is the HEALTHY natural color of this item
  const isNaturallyOrangeOrTan =
    bestCategory === 'Orange' ||
    bestCategory === 'Carrot' ||
    bestCategory === 'Potato' ||
    orangeRatio >= 0.28 ||
    (earthenRatio >= 0.38 && redRatio < 0.15 && yellowRatio < 0.25);

  const isNaturallyGreen = bestCategory === 'Cucumber' || greenRatio >= 0.35;

  // 5. Local neighborhood statistics over interior skin pixels (radius = 8 -> 17x17 window)
  // Used to separate localized dark spots & speckled fungal spores from smooth curved shading & glossy highlights
  const winR = 8;
  let darkSpotCount = 0;
  let browningCount = 0;
  let penicilliumMoldCount = 0;
  let fuzzyMyceliumCount = 0;
  let gradientSum = 0;
  let gradientPairs = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (!skinMask[p]) continue;

      const lum = lumArr[p];
      const h = hueArr[p];
      const s = satArr[p];
      const v = valArr[p];

      // Local roughness gradient with right and bottom skin neighbors
      if (x + 1 < W && skinMask[p + 1]) {
        gradientSum += Math.abs(lum - lumArr[p + 1]);
        gradientPairs++;
      }
      if (y + 1 < H && skinMask[p + W]) {
        gradientSum += Math.abs(lum - lumArr[p + W]);
        gradientPairs++;
      }

      // Compute 17x17 neighborhood mean & std (sampled every 2px for speed)
      let nSum = 0;
      let nSqSum = 0;
      let nCount = 0;
      let nearbyDarkOrTeal = 0;
      const y0 = Math.max(0, y - winR);
      const y1 = Math.min(H - 1, y + winR);
      const x0 = Math.max(0, x - winR);
      const x1 = Math.min(W - 1, x + winR);

      for (let ny = y0; ny <= y1; ny += 2) {
        for (let nx = x0; nx <= x1; nx += 2) {
          const np = ny * W + nx;
          if (!fgMask[np]) continue;
          const nLum = lumArr[np];
          nSum += nLum;
          nSqSum += nLum * nLum;
          nCount++;
          const nh = hueArr[np];
          const ns = satArr[np];
          const nv = valArr[np];
          if (nLum < 46 || (nh >= 148 && nh <= 208 && ns >= 0.20 && nv <= 0.75)) {
            nearbyDarkOrTeal++;
          }
        }
      }

      const localMean = nCount > 0 ? nSum / nCount : medianSkinLum;
      const localVar = nCount > 1 ? Math.max(0, nSqSum / nCount - localMean * localMean) : 0;
      const localStd = Math.sqrt(localVar);

      // (A) Dark Spots: Either severe necrotic black (< 32 lum) OR genuinely dark necrotic lesion (< 52 lum)
      // markedly darker than its immediate surrounding skin (excludes medium-brown aging sugar freckles & smooth shading!)
      const isDeepNecroticBlack = lum < 32 && v < 0.19;
      const isLocalizedDarkLesion =
        lum < 52 &&
        v < 0.30 &&
        lum < localMean * 0.65 &&
        localMean - lum > 24 &&
        lum < medianSkinLum * 0.58;

      if (isDeepNecroticBlack || isLocalizedDarkLesion) {
        darkSpotCount++;
      }

      // (B) Browning / Necrosis Discoloration:
      // Calibrated relative to whether orange/earthen brown is already the healthy skin color
      if (isNaturallyOrangeOrTan) {
        // On Oranges, Carrots, and Potatoes, normal warm skin is NOT browning;
        // necrosis manifests as dull, darkened muddy tissue significantly darker than median skin
        if (
          h >= 10 &&
          h <= 45 &&
          s >= 0.18 &&
          v < 0.42 &&
          lum < medianSkinLum * 0.62
        ) {
          browningCount++;
        }
      } else {
        // On Apples, Tomatoes, Bananas, Strawberries, Peppers, Cucumbers:
        // brown/amber-muddy discoloration darker than healthy skin indicates senescence/rot
        const isBrownHue =
          h >= 14 &&
          h <= 42 &&
          s >= 0.24 &&
          s <= 0.95 &&
          lum >= 25 &&
          lum <= 135 &&
          lum < medianSkinLum * 0.82;
        const isDeepRottenCrimson =
          (h >= 345 || h <= 14) && v < 0.26 && lum < medianSkinLum * 0.52;
        if (isBrownHue || isDeepRottenCrimson) {
          browningCount++;
        }
      }

      // (C) Mold-like Mycelium Detection (strictly separated from specular gloss!)
      // 1. Blue-green / teal Penicillium bloom on non-green produce
      const isTealPenicillium =
        !isNaturallyGreen &&
        h >= 148 &&
        h <= 208 &&
        s >= 0.20 &&
        v >= 0.20 &&
        v <= 0.78;

      if (isTealPenicillium) {
        penicilliumMoldCount++;
      } else if (s < 0.28 && v >= 0.52 && v <= 0.97) {
        // Pale white/gray pixel: distinguish fuzzy fungal mycelium / mold halo from clean glossy highlight!
        // Specular gloss on fresh produce sits on healthy lit skin with ZERO nearby rot or teal spores.
        const hasNearbyRotOrMold = nearbyDarkOrTeal >= 2 || (nearbyDarkOrTeal >= 1 && localStd > 22);
        if (hasNearbyRotOrMold) {
          fuzzyMyceliumCount++;
        }
      }
    }
  }

  // Also detect pale green fungal spore dots (e.g. Aspergillus / green mold specks inside necrotic lesions)
  let greenSporeOnWarmFruit = 0;
  if (!isNaturallyGreen && (redRatio > 0.22 || orangeRatio > 0.22)) {
    for (let y = minY + Math.round(fgHeight * 0.25); y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const p = y * W + x;
        if (!skinMask[p]) continue;
        const h = hueArr[p];
        const s = satArr[p];
        const v = valArr[p];
        if (h >= 95 && h <= 165 && s >= 0.14 && s <= 0.72 && v >= 0.50) {
          greenSporeOnWarmFruit++;
        }
      }
    }
  }

  const totalMoldPixels = penicilliumMoldCount + fuzzyMyceliumCount + greenSporeOnWarmFruit;

  const darkSpotPercent = +((darkSpotCount / skinCount) * 100).toFixed(1);
  const browningPercent = +((browningCount / skinCount) * 100).toFixed(1);
  const moldPercent = +((totalMoldPixels / skinCount) * 100).toFixed(1);
  const meanGrad = gradientPairs > 0 ? gradientSum / gradientPairs : 0;
  const roughnessScore = +Math.min(10, (meanGrad / 18) * 10).toFixed(2);

  // 6. Derive Visible Warning Indicators strictly from measured optical defects
  const visibleIndicators: string[] = [];
  if (browningPercent >= 3.2 || (darkSpotPercent >= 8.0 && browningPercent >= 1.5)) {
    visibleIndicators.push('Discoloration');
  }
  if (darkSpotPercent >= 2.2) {
    visibleIndicators.push('Dark spots');
  }
  if (roughnessScore >= 3.4) {
    visibleIndicators.push('Wrinkles or shriveling');
  }
  if (moldPercent >= 1.0 || (totalMoldPixels >= 16 && darkSpotPercent >= 5.0)) {
    visibleIndicators.push('Mold-like patterns');
  }
  if (
    browningPercent >= 16.0 ||
    darkSpotPercent >= 11.0 ||
    moldPercent >= 10.0 ||
    (moldPercent >= 4.0 && (darkSpotPercent >= 3.0 || browningPercent >= 4.0))
  ) {
    visibleIndicators.push('Surface breakdown');
  }

  // 7. Calibrated 3-Class Softmax Scoring (Fresh / Aging / Visibly Spoiled)
  // Defect severity index weighted by biological spoilage significance
  const defectSeverity =
    moldPercent * 4.2 +
    darkSpotPercent * 1.6 +
    browningPercent * 1.25 +
    Math.max(0, roughnessScore - 1.8) * 3.0;

  let logitFresh =
    2.45 +
    (categoryConfidence - 75) * 0.018 +
    Math.min(0.35, fgCoverage * 0.6) -
    meanGrad * 0.05 -
    defectSeverity * 0.26;
  let logitAging = -0.4 + Math.min(2.4, defectSeverity * 0.22) - Math.max(0, defectSeverity - 14) * 0.20;
  let logitSpoiled = -2.8 + defectSeverity * 0.21;

  // Strong mold bloom or heavy necrosis decisively elevates Spoiled logit
  if (moldPercent >= 2.2 || (totalMoldPixels >= 16 && darkSpotPercent >= 8.0) || darkSpotPercent >= 12.0 || browningPercent >= 20.0) {
    logitSpoiled += 1.8;
    logitFresh -= 2.0;
  } else if (
    moldPercent < 1.2 &&
    (darkSpotPercent >= 2.2 || browningPercent >= 3.2 || roughnessScore >= 3.4)
  ) {
    logitAging += 1.3;
  }

  const maxLogit = Math.max(logitFresh, logitAging, logitSpoiled);
  const expFresh = Math.exp(logitFresh - maxLogit);
  const expAging = Math.exp(logitAging - maxLogit);
  const expSpoiled = Math.exp(logitSpoiled - maxLogit);
  const sumExp = expFresh + expAging + expSpoiled;

  const probFresh = expFresh / sumExp;
  const probAging = expAging / sumExp;
  const probSpoiled = expSpoiled / sumExp;

  let freshnessClassification: FreshnessClassification = 'Fresh';
  let winningProb = probFresh;

  if (probSpoiled >= probAging && probSpoiled >= probFresh) {
    freshnessClassification = 'Visibly Spoiled';
    winningProb = probSpoiled;
  } else if (probAging >= probFresh && probAging >= probSpoiled) {
    freshnessClassification = 'Aging';
    winningProb = probAging;
  } else {
    freshnessClassification = 'Fresh';
    winningProb = probFresh;
  }

  const calibratedIndicators = sanitizeIndicators(visibleIndicators, freshnessClassification);
  const freshnessConfidence = +Math.min(98.5, Math.max(38.0, winningProb * 100)).toFixed(1);

  const catName =
    bestCategory !== 'Unknown or unsupported category' ? bestCategory : 'produce sample';
  let explanation = '';
  if (freshnessClassification === 'Fresh') {
    explanation = `Surface optical analysis of ${catName} shows intact dermal coloration with ${browningPercent}% browning, ${darkSpotPercent}% localized dark spots, and ${moldPercent}% mold-like patterns. Gloss and texture (${roughnessScore}/10 roughness) are consistent with fresh produce.`;
  } else if (freshnessClassification === 'Aging') {
    explanation = `Surface optical inspection of ${catName} detected moderate senescence (${browningPercent}% discoloration, ${darkSpotPercent}% dark spots, texture roughness ${roughnessScore}/10) without extensive fungal bloom (${moldPercent}%), indicating an aging condition.`;
  } else {
    explanation = `Surface optical inspection of ${catName} identified clear spoilage signatures (${moldPercent}% mold-like patterns, ${darkSpotPercent}% necrotic dark spots, ${browningPercent}% browning discoloration), consistent with visible decay.`;
  }

  return {
    foodCategory: bestCategory,
    categoryConfidence: +categoryConfidence.toFixed(1),
    freshnessClassification,
    freshnessConfidence,
    classProbabilities: {
      Fresh: +(probFresh * 100).toFixed(1),
      Aging: +(probAging * 100).toFixed(1),
      'Visibly Spoiled': +(probSpoiled * 100).toFixed(1),
    },
    visibleIndicators: calibratedIndicators,
    explanation,
    cvMetrics: {
      darkSpotAreaPercent: darkSpotPercent,
      browningNecrosisPercent: browningPercent,
      moldIndicatorPercent: moldPercent,
      surfaceRoughnessScore: roughnessScore,
      analyzedBytes: byteLength,
      foregroundCoveragePercent: +(fgCoverage * 100).toFixed(1),
      aspectRatio: +origAspect.toFixed(2),
      dominantHue,
    },
  };
}

/**
 * Calls server-side Gemini multimodal vision with fast failover across supported Flash models
 * if a particular model experiences temporary 503 capacity spikes.
 */
async function classifyWithGeminiVision(
  cleanBase64: string,
  mimeType: string
): Promise<{
  isFoodItem: boolean;
  foodCategory: string;
  freshnessClassification: FreshnessClassification;
  confidenceScore: number;
  classProbabilities: { Fresh: number; Aging: number; 'Visibly Spoiled': number };
  visibleIndicators: string[];
  explanation: string;
  usedModelId: string;
} | null> {
  if (!ai) return null;

  const promptText = `You are a food quality and computer vision inspection specialist.
Examine ONLY what is genuinely visible in this image (which may be a real photograph OR a stylized 2D produce benchmark illustration/render). Do NOT assume food is spoiled unless clear decay, mold, or rot is actually visible.

Tasks:
1. Set isFoodItem = true if the image depicts any fruit, vegetable, or bakery/food item (including 2D rendered produce diagrams such as an orange with teal/white Penicillium mold patches or a tomato with black rot). Set isFoodItem = false ONLY for non-food objects (people, vehicles, electronics, documents, landscapes, blank frames).
2. Identify foodCategory (e.g., Apple, Banana, Tomato, Potato, Orange, Strawberry, Bell Pepper, Carrot, Cucumber, Lettuce, Bread / Bakery item), or "Unknown or unsupported category" if isFoodItem is false.
3. Classify its true visible freshness condition into EXACTLY one of these 3 classes:
   - "Fresh": Vibrant natural color, firm intact skin/surface, normal specular shine/gloss, free of mold or rot. (Do NOT mistake normal glossy light reflections, stems, potato eyes, or shadows for mold or dark spots.)
   - "Aging": Early senescence, minor shriveling/wrinkles, sugar freckling on bananas, mild softening or minor surface blemishes, but no active mold or severe rot.
   - "Visibly Spoiled": Active visible fungal mold/mycelium (white/gray/blue-green/teal patches or fuzz), sunken black necrotic rot, liquefaction, or severe tissue breakdown.
4. Provide calibrated class probabilities (0 to 100) for all three classes (freshProb, agingProb, spoiledProb) that sum to approximately 100, and set confidenceScore equal to the probability of your chosen freshnessClassification.
5. List ONLY the warning indicators that are genuinely visible on the food from this exact set:
   - "Discoloration"
   - "Dark spots"
   - "Wrinkles or shriveling"
   - "Mold-like patterns"
   - "Surface breakdown"
   If the food is Fresh with no defects, return an empty array [].
6. Provide a concise factual explanation of the specific visual features observed.`;

  const candidateModels = [
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest',
  ];

  for (const modelId of candidateModels) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const geminiPromise = ai.models.generateContent({
        model: modelId,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: promptText,
            },
          ],
        },
        config: {
          ...(modelId.startsWith('gemini-3')
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isFoodItem: {
                type: Type.BOOLEAN,
                description: 'True if image shows food/produce (photo or illustration), false if non-food',
              },
              foodCategory: {
                type: Type.STRING,
                description: 'Detected food category or "Unknown or unsupported category"',
              },
              freshnessClassification: {
                type: Type.STRING,
                description: 'Exactly one of "Fresh", "Aging", or "Visibly Spoiled"',
              },
              freshProb: {
                type: Type.NUMBER,
                description: 'Probability (0-100) that the item is Fresh',
              },
              agingProb: {
                type: Type.NUMBER,
                description: 'Probability (0-100) that the item is Aging',
              },
              spoiledProb: {
                type: Type.NUMBER,
                description: 'Probability (0-100) that the item is Visibly Spoiled',
              },
              confidenceScore: {
                type: Type.NUMBER,
                description: 'Confidence percentage (10-99) matching the predicted class',
              },
              visibleIndicators: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Genuine visible warning indicators, or empty array [] if Fresh',
              },
              explanation: {
                type: Type.STRING,
                description: 'Concise factual explanation of observed surface condition',
              },
            },
            required: [
              'isFoodItem',
              'foodCategory',
              'freshnessClassification',
              'freshProb',
              'agingProb',
              'spoiledProb',
              'confidenceScore',
              'visibleIndicators',
              'explanation',
            ],
          },
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Model ${modelId} timed out after 12s`)), 12000);
      });

      const response = await Promise.race([geminiPromise, timeoutPromise]);
      const parsed = JSON.parse(response.text || '{}');

      const pFresh = Math.max(0, Number(parsed.freshProb) || 0);
      const pAging = Math.max(0, Number(parsed.agingProb) || 0);
      const pSpoiled = Math.max(0, Number(parsed.spoiledProb) || 0);
      const probSum = pFresh + pAging + pSpoiled;

      const rawCat = String(parsed.foodCategory || '').trim();
      const genericLabels = new Set(['produce item', 'fruit', 'vegetable', 'food', 'unknown', 'none']);
      const isFoodItem = parsed.isFoodItem !== false;
      const foodCategory =
        isFoodItem && rawCat && !genericLabels.has(rawCat.toLowerCase())
          ? rawCat
          : 'Unknown or unsupported category';

      // If a lite model abstained with all-zero probabilities on an unrecognizable graphic, try the next candidate model
      if (probSum < 10 && Number(parsed.confidenceScore || 0) < 10) {
        console.warn(`[Gemini Vision] ${modelId} returned uncalibrated zero probabilities; trying next model...`);
        continue;
      }

      let freshnessClassification = normalizeFreshnessLabel(parsed.freshnessClassification);
      let confidenceScore = Number(parsed.confidenceScore) || 0;
      let normFresh = freshnessClassification === 'Fresh' ? confidenceScore : (100 - confidenceScore) / 2;
      let normAging = freshnessClassification === 'Aging' ? confidenceScore : (100 - confidenceScore) / 2;
      let normSpoiled =
        freshnessClassification === 'Visibly Spoiled' ? confidenceScore : (100 - confidenceScore) / 2;

      if (probSum > 0) {
        normFresh = (pFresh / probSum) * 100;
        normAging = (pAging / probSum) * 100;
        normSpoiled = (pSpoiled / probSum) * 100;

        if (normSpoiled >= normAging && normSpoiled >= normFresh) {
          freshnessClassification = 'Visibly Spoiled';
          confidenceScore = normSpoiled;
        } else if (normAging >= normFresh && normAging >= normSpoiled) {
          freshnessClassification = 'Aging';
          confidenceScore = normAging;
        } else {
          freshnessClassification = 'Fresh';
          confidenceScore = normFresh;
        }
      }

      if (foodCategory === 'Unknown or unsupported category') {
        confidenceScore = +Math.min(45.0, Math.max(25.0, confidenceScore)).toFixed(1);
      } else {
        confidenceScore = +Math.min(99.0, Math.max(34.0, confidenceScore)).toFixed(1);
      }

      const visibleIndicators = sanitizeIndicators(
        parsed.visibleIndicators,
        freshnessClassification
      );

      return {
        isFoodItem,
        foodCategory,
        freshnessClassification,
        confidenceScore,
        classProbabilities: {
          Fresh: +normFresh.toFixed(1),
          Aging: +normAging.toFixed(1),
          'Visibly Spoiled': +normSpoiled.toFixed(1),
        },
        visibleIndicators,
        explanation: String(parsed.explanation || '').trim(),
        usedModelId: modelId,
      };
    } catch (err: any) {
      console.warn(`[Gemini Vision] ${modelId} unavailable (${err?.message || err}); trying next...`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return null;
}

// --------------------------------------------------------------------------
// API Endpoints
// --------------------------------------------------------------------------

// GET /health and /api/health
const handleHealth = (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'T238 – AI-Based Food Quality & Freshness Assessment',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    gemini_configured: Boolean(ai),
    sqlite_connected: true,
  });
};
app.get('/health', handleHealth);
app.get('/api/health', handleHealth);

// GET /model/status and /api/model/status
const handleModelStatus = (_req: Request, res: Response) => {
  res.json({
    model_name: ai
      ? 'Gemini Multimodal Vision + Sharp Optical CV Surface Analyzer'
      : 'Sharp Optical Computer Vision Surface Heuristic Analyzer',
    model_version: '2.5.0',
    status: ai ? 'ready' : 'cv_fallback_only',
    weights_loaded: Boolean(ai),
    architecture: ai
      ? 'Server-Side Multimodal Vision Classifier + Foreground-Segmented Optical Defect Extractor'
      : 'Foreground-Segmented HSV/Luminance Computer Vision Heuristic Classifier (No Neural Weights)',
    input_resolution: '224x224x3 (Aspect-Preserving)',
    freshness_classes: ['Fresh', 'Aging', 'Visibly Spoiled'],
    supported_food_categories: [
      'Apple',
      'Banana',
      'Tomato',
      'Potato',
      'Orange',
      'Strawberry',
      'Bell Pepper',
      'Carrot',
      'Cucumber',
      'Lettuce',
      'Bread / Bakery item',
    ],
    features_detected: [
      'Discoloration',
      'Dark spots',
      'Wrinkles or shriveling',
      'Mold-like patterns',
      'Surface breakdown',
    ],
    confidence_calibration:
      'Normalized 3-class probability distribution (Fresh / Aging / Visibly Spoiled)',
    gemini_engine_ready: Boolean(ai),
  });
};
app.get('/model/status', handleModelStatus);
app.get('/api/model/status', handleModelStatus);

// POST /analyze and /api/analyze
const handleAnalyze = async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', confidenceThreshold = 70 } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({
        error: 'Missing imageBase64 in request body. Please provide a valid food image.',
      });
    }

    // Extract & validate MIME type if data URL prefix is included
    const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.+)$/s);
    const detectedMime = (dataUrlMatch ? dataUrlMatch[1] : String(mimeType)).toLowerCase().trim();
    if (!ALLOWED_MIMES.has(detectedMime)) {
      return res.status(400).json({
        error: `Unsupported file format (${detectedMime || 'unknown'}). Please upload JPG, PNG, or WEBP.`,
      });
    }
    const normalizedMime = detectedMime === 'image/jpg' ? 'image/jpeg' : detectedMime;

    const cleanBase64 = dataUrlMatch
      ? dataUrlMatch[2].trim()
      : imageBase64.replace(/^data:[^;]+;base64,/, '').trim();

    if (!cleanBase64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(cleanBase64)) {
      return res.status(400).json({
        error: 'Invalid base64 image payload.',
      });
    }

    const buffer = Buffer.from(cleanBase64, 'base64');

    // Validate size (max 12MB)
    if (buffer.length > 12 * 1024 * 1024) {
      return res.status(400).json({
        error: 'Image exceeds maximum allowable file size of 12MB.',
      });
    }

    if (buffer.length < 64) {
      return res.status(400).json({
        error: 'Image file is empty or corrupted.',
      });
    }

    // 1. Validate image integrity and run foreground-segmented Computer Vision analysis
    const cvResult = await classifyFoodWithComputerVision(buffer);

    let foodCategory = cvResult.foodCategory;
    let freshnessClassification: FreshnessClassification = cvResult.freshnessClassification;
    let confidenceScore = cvResult.freshnessConfidence;
    let visibleIndicators = cvResult.visibleIndicators;
    let explanation = cvResult.explanation;
    const cvMetrics = cvResult.cvMetrics;
    let modelName = 'T238-OpticalCV-Heuristic';
    const modelVersion = '2.5.0';

    // 2. Run multimodal Gemini Vision classification and ensemble-calibrate with Optical CV
    const geminiResult = await classifyWithGeminiVision(cleanBase64, normalizedMime);
    if (geminiResult) {
      const geminiMissedStylizedProduce =
        geminiResult.foodCategory === 'Unknown or unsupported category' &&
        cvResult.foodCategory !== 'Unknown or unsupported category' &&
        cvResult.categoryConfidence >= 82 &&
        (geminiResult.isFoodItem ||
          cvMetrics.moldIndicatorPercent >= 4.0 ||
          (cvMetrics.darkSpotAreaPercent >= 8.0 && cvMetrics.browningNecrosisPercent >= 4.0));

      if (!geminiMissedStylizedProduce) {
        foodCategory = geminiResult.foodCategory;
        modelName = `T238-Vision-${geminiResult.usedModelId}`;

        if (foodCategory === 'Unknown or unsupported category') {
          freshnessClassification = geminiResult.freshnessClassification;
          confidenceScore = geminiResult.confidenceScore;
          visibleIndicators = [];
          explanation =
            geminiResult.explanation ||
            'Image could not be verified as a supported food item. Manual visual inspection is required.';
        } else {
          // Calibrated probability fusion between Multimodal Vision and Foreground Optical CV
          const hasSevereOpticalDecay =
            (cvMetrics.moldIndicatorPercent >= 2.5 && cvMetrics.darkSpotAreaPercent >= 8.0) ||
            cvMetrics.moldIndicatorPercent >= 8.0 ||
            cvMetrics.darkSpotAreaPercent >= 16.0;

          const wGemini = hasSevereOpticalDecay ? 0.30 : 0.72;
          const wCv = 1.0 - wGemini;

          const rawFresh =
            wGemini * geminiResult.classProbabilities.Fresh +
            wCv * cvResult.classProbabilities.Fresh;
          const rawAging =
            wGemini * geminiResult.classProbabilities.Aging +
            wCv * cvResult.classProbabilities.Aging;
          const rawSpoiled =
            wGemini * geminiResult.classProbabilities['Visibly Spoiled'] +
            wCv * cvResult.classProbabilities['Visibly Spoiled'];
          const totalEns = Math.max(1e-6, rawFresh + rawAging + rawSpoiled);

          const ensFresh = (rawFresh / totalEns) * 100;
          const ensAging = (rawAging / totalEns) * 100;
          const ensSpoiled = (rawSpoiled / totalEns) * 100;

          if (ensSpoiled >= ensAging && ensSpoiled >= ensFresh) {
            freshnessClassification = 'Visibly Spoiled';
            confidenceScore = +Math.min(98.8, Math.max(38.0, ensSpoiled)).toFixed(1);
          } else if (ensAging >= ensFresh && ensAging >= ensSpoiled) {
            freshnessClassification = 'Aging';
            confidenceScore = +Math.min(98.8, Math.max(38.0, ensAging)).toFixed(1);
          } else {
            freshnessClassification = 'Fresh';
            confidenceScore = +Math.min(98.8, Math.max(38.0, ensFresh)).toFixed(1);
          }

          if (freshnessClassification === geminiResult.freshnessClassification) {
            const merged =
              freshnessClassification === 'Fresh'
                ? []
                : [...geminiResult.visibleIndicators, ...cvResult.visibleIndicators];
            visibleIndicators = sanitizeIndicators(merged, freshnessClassification);
            explanation = geminiResult.explanation || cvResult.explanation;
          } else {
            visibleIndicators = sanitizeIndicators(
              [...cvResult.visibleIndicators, ...geminiResult.visibleIndicators],
              freshnessClassification
            );
            explanation = cvResult.explanation;
          }
        }
      }
    } else if (!ai) {
      explanation +=
        ' (Evaluated via optical pixel heuristics; configure GEMINI_API_KEY for deep multimodal vision.)';
    }

    const thresholdNum = Math.min(99, Math.max(1, Number(confidenceThreshold) || 70));
    const isLowConfidence =
      confidenceScore < thresholdNum || foodCategory === 'Unknown or unsupported category';

    const analysisId =
      'FA-' +
      Date.now().toString(36).toUpperCase() +
      '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase();
    const timestamp = new Date().toISOString();

    // Generate compact JPEG preview thumbnail so SQLite stays fast & lightweight
    const thumbBuf = await sharp(buffer)
      .rotate()
      .flatten({ background: { r: 248, g: 250, b: 252 } })
      .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    const thumbnailData = `data:image/jpeg;base64,${thumbBuf.toString('base64')}`;

    const insertStmt = db.prepare(`
      INSERT INTO analyses (
        id, timestamp, food_category, freshness_classification,
        confidence_score, visible_indicators, explanation,
        model_name, model_version, image_data, cv_metrics
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      analysisId,
      timestamp,
      foodCategory,
      freshnessClassification,
      confidenceScore,
      JSON.stringify(visibleIndicators),
      explanation,
      modelName,
      modelVersion,
      thumbnailData,
      JSON.stringify(cvMetrics)
    );

    return res.json({
      id: analysisId,
      timestamp,
      food_category: foodCategory,
      freshness_classification: freshnessClassification,
      confidence_score: +confidenceScore.toFixed(1),
      is_low_confidence: isLowConfidence,
      confidence_threshold_applied: thresholdNum,
      visible_warning_indicators: visibleIndicators,
      explanation,
      model_name: modelName,
      model_version: modelVersion,
      cv_metrics: cvMetrics,
      food_safety_disclaimer:
        'Food Safety Notice: This AI assessment evaluates visible surface indicators only. It cannot detect internal pathogens, toxins, bacteria (e.g. Salmonella, E. coli), or microscopic spoilage. Do not consume food if smell, taste, or texture seems off, regardless of AI output.',
    });
  } catch (err: any) {
    if (err instanceof InvalidImageError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Error during food freshness analysis:', err);
    return res.status(500).json({
      error: 'Inference failed: ' + (err.message || 'An error occurred during image processing.'),
    });
  }
};
app.post('/analyze', handleAnalyze);
app.post('/api/analyze', handleAnalyze);

// GET /history and /api/history
const handleGetHistory = (_req: Request, res: Response) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT id, timestamp, food_category, freshness_classification,
             confidence_score, visible_indicators, explanation,
             model_name, model_version, image_data, cv_metrics
      FROM analyses
      ORDER BY timestamp DESC
    `
      )
      .all();

    const formatted = rows.map((r: any) => {
      const freshness = normalizeFreshnessLabel(r.freshness_classification);
      let parsedIndicators: string[] = [];
      try {
        parsedIndicators = sanitizeIndicators(
          JSON.parse(r.visible_indicators || '[]'),
          freshness
        );
      } catch {
        parsedIndicators = [];
      }
      let parsedMetrics = null;
      try {
        parsedMetrics = r.cv_metrics ? JSON.parse(r.cv_metrics) : null;
      } catch {
        parsedMetrics = null;
      }

      return {
        ...r,
        freshness_classification: freshness,
        confidence_score: +(Number(r.confidence_score) || 0).toFixed(1),
        visible_indicators: parsedIndicators,
        cv_metrics: parsedMetrics,
      };
    });

    res.json({
      total: formatted.length,
      records: formatted,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve history: ' + err.message });
  }
};
app.get('/history', handleGetHistory);
app.get('/api/history', handleGetHistory);

// GET /history/:id and /api/history/:id
const handleGetHistoryById = (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const row: any = db.prepare(`SELECT * FROM analyses WHERE id = ?`).get(id);

    if (!row) {
      return res.status(404).json({ error: 'Analysis record not found' });
    }

    const freshness = normalizeFreshnessLabel(row.freshness_classification);
    let parsedIndicators: string[] = [];
    try {
      parsedIndicators = sanitizeIndicators(
        JSON.parse(row.visible_indicators || '[]'),
        freshness
      );
    } catch {
      parsedIndicators = [];
    }

    res.json({
      ...row,
      freshness_classification: freshness,
      confidence_score: +(Number(row.confidence_score) || 0).toFixed(1),
      visible_indicators: parsedIndicators,
      cv_metrics: row.cv_metrics ? JSON.parse(row.cv_metrics) : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch analysis: ' + err.message });
  }
};
app.get('/history/:id', handleGetHistoryById);
app.get('/api/history/:id', handleGetHistoryById);

// DELETE /history and /api/history
const handleDeleteHistory = (_req: Request, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM analyses').run();
    res.json({
      message: 'Analysis history successfully cleared',
      deleted_count: result.changes,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear history: ' + err.message });
  }
};
app.delete('/history', handleDeleteHistory);
app.delete('/api/history', handleDeleteHistory);

// GET /export/csv and /api/export/csv
const handleExportCsv = (_req: Request, res: Response) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT id, timestamp, food_category, freshness_classification,
             confidence_score, visible_indicators, model_name, model_version
      FROM analyses
      ORDER BY timestamp DESC
    `
      )
      .all();

    const headers = [
      'Analysis ID',
      'Timestamp',
      'Food Category',
      'Freshness Classification',
      'Confidence (%)',
      'Visible Warning Indicators',
      'Model Name',
      'Model Version',
    ];

    const escapeCsvField = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const csvLines = [headers.map(escapeCsvField).join(',')];

    for (const row of rows as any[]) {
      const freshness = normalizeFreshnessLabel(row.freshness_classification);
      let parsedIndicators: string[] = [];
      try {
        const raw = Array.isArray(row.visible_indicators)
          ? row.visible_indicators
          : JSON.parse(row.visible_indicators || '[]');
        parsedIndicators = sanitizeIndicators(raw, freshness);
      } catch {
        parsedIndicators = [];
      }

      const indicatorsStr = parsedIndicators.length > 0 ? parsedIndicators.join('; ') : 'None';
      const confNum = Number(row.confidence_score);
      const confFormatted = !isNaN(confNum) ? confNum.toFixed(1) : '0.0';

      const line = [
        escapeCsvField(row.id),
        escapeCsvField(row.timestamp),
        escapeCsvField(row.food_category || 'Unknown'),
        escapeCsvField(freshness),
        escapeCsvField(confFormatted),
        escapeCsvField(indicatorsStr),
        escapeCsvField(row.model_name || 'T238-OpticalCV-Heuristic'),
        escapeCsvField(row.model_version || '2.5.0'),
      ];
      csvLines.push(line.join(','));
    }

    const csvBuffer = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(csvLines.join('\r\n'), 'utf-8'),
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="food_freshness_assessment_export_${Date.now()}.csv"`
    );
    res.send(csvBuffer);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to export CSV: ' + err.message });
  }
};
app.get('/export/csv', handleExportCsv);
app.get('/api/export/csv', handleExportCsv);

// --------------------------------------------------------------------------
// Vite integration for frontend
// --------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Food Quality & Freshness Assessment server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}

export { app };
