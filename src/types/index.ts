/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type FreshnessClass = 'Fresh' | 'Aging' | 'Visibly Spoiled';

export function normalizeFreshnessClass(raw: unknown): FreshnessClass {
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

export interface CVMetrics {
  browningNecrosisPercent?: number;
  darkSpotAreaPercent?: number;
  moldIndicatorPercent?: number;
  surfaceRoughnessScore?: number;
  browning_percent?: number;
  dark_spot_percent?: number;
  surface_roughness_score?: number;
  mold_indicator_ratio?: number;
  analyzedBytes?: number;
  foregroundCoveragePercent?: number;
  aspectRatio?: number;
  dominantHue?: number;
}

export interface AnalysisResult {
  id: string;
  timestamp: string;
  food_category: string;
  freshness_classification: FreshnessClass;
  confidence_score: number;
  is_low_confidence: boolean;
  confidence_threshold_applied: number;
  visible_warning_indicators: string[];
  explanation: string;
  model_name: string;
  model_version: string;
  cv_metrics?: CVMetrics;
  food_safety_disclaimer: string;
  image_data?: string;
}

export interface AnalysisRecord {
  id: string;
  timestamp: string;
  food_category: string;
  freshness_classification: FreshnessClass;
  confidence_score: number;
  visible_indicators: string[];
  explanation: string;
  model_name: string;
  model_version: string;
  image_data?: string;
  cv_metrics?: CVMetrics;
}

export interface ModelStatus {
  model_name: string;
  model_version: string;
  status: string;
  architecture?: string;
  weights_loaded?: boolean;
  freshness_classes: string[];
  supported_food_categories: string[];
  input_resolution: string;
  confidence_calibration?: string;
  features_detected?: string[];
  gemini_engine_ready?: boolean;
}

export interface DashboardStats {
  total: number;
  freshCount: number;
  agingCount: number;
  spoiledCount: number;
  avgConfidence: number;
  categoryCounts: Record<string, number>;
}
