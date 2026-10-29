/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Calendar,
  ShieldAlert,
  Cpu,
  Info
} from 'lucide-react';
import { AnalysisRecord, FreshnessClass, normalizeFreshnessClass } from '../types';

interface DetailModalProps {
  record: AnalysisRecord | null;
  onClose: () => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({ record, onClose }) => {
  if (!record) return null;

  const normalizedFreshness = normalizeFreshnessClass(record.freshness_classification);

  const getFreshnessColor = (cls: FreshnessClass) => {
    switch (cls) {
      case 'Fresh':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      case 'Aging':
        return 'bg-amber-50 text-amber-800 border-amber-300';
      case 'Visibly Spoiled':
      default:
        return 'bg-rose-50 text-rose-800 border-rose-300';
    }
  };

  const Icon =
    normalizedFreshness === 'Fresh'
      ? CheckCircle2
      : normalizedFreshness === 'Aging'
      ? Clock
      : AlertTriangle;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-stone-200 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <span className="text-xs font-mono text-stone-400 font-semibold">{record.id}</span>
            <h3 className="text-base font-extrabold text-stone-900 mt-0.5">
              Historical Assessment Record
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Food Image Preview */}
        {record.image_data && (
          <div className="rounded-xl overflow-hidden border border-stone-200 bg-stone-100 aspect-video sm:aspect-16/9 flex items-center justify-center">
            <img
              src={record.image_data}
              alt={record.food_category}
              className="max-h-full max-w-full object-contain mx-auto"
            />
          </div>
        )}

        {/* Classification Summary */}
        <div className={`p-4 rounded-xl border ${getFreshnessColor(normalizedFreshness)} flex items-center justify-between`}>
          <div className="flex items-center space-x-3">
            <Icon className="w-6 h-6 shrink-0" />
            <div>
              <div className="text-[11px] uppercase font-bold tracking-wider opacity-75">
                Freshness Classification
              </div>
              <div className="text-base font-extrabold">{normalizedFreshness}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-extrabold">{(Number(record.confidence_score) || 0).toFixed(1)}%</div>
            <div className="text-[10px] opacity-75 font-medium">Confidence</div>
          </div>
        </div>

        {/* Food Category & Timestamp */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-400 uppercase font-bold block mb-1">Food Category</span>
            <span className="font-extrabold text-stone-900 text-sm">{record.food_category}</span>
          </div>
          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
            <span className="text-[10px] text-stone-400 uppercase font-bold block mb-1">Timestamp</span>
            <span className="font-mono text-stone-700">
              {new Date(record.timestamp).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Visible Warning Indicators */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-stone-500" />
            <span>Visible Warning Indicators</span>
          </span>
          {record.visible_indicators && record.visible_indicators.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {record.visible_indicators.map((ind, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold bg-stone-100 text-stone-800 border border-stone-200"
                >
                  {ind}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-500 italic">No surface decay indicators flagged.</p>
          )}
        </div>

        {/* Explanation */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-stone-500" />
            <span>Optical Analysis Explanation</span>
          </span>
          <p className="text-xs text-stone-600 bg-stone-50 p-3 rounded-lg border border-stone-200 leading-relaxed">
            {record.explanation}
          </p>
        </div>

        {/* Surface Optical Metrics */}
        {record.cv_metrics && (
          <div className="space-y-2 pt-2 border-t border-stone-100">
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
              Surface Optical Indices
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-stone-50 p-2 rounded-lg border border-stone-100">
                <div className="text-stone-400 text-[10px]">Browning</div>
                <div className="font-mono font-bold text-stone-800">
                  {record.cv_metrics.browningNecrosisPercent ?? record.cv_metrics.browning_percent ?? 0}%
                </div>
              </div>
              <div className="bg-stone-50 p-2 rounded-lg border border-stone-100">
                <div className="text-stone-400 text-[10px]">Dark Spots</div>
                <div className="font-mono font-bold text-stone-800">
                  {record.cv_metrics.darkSpotAreaPercent ?? record.cv_metrics.dark_spot_percent ?? 0}%
                </div>
              </div>
              <div className="bg-stone-50 p-2 rounded-lg border border-stone-100">
                <div className="text-stone-400 text-[10px]">Mold Ratio</div>
                <div className="font-mono font-bold text-stone-800">
                  {record.cv_metrics.moldIndicatorPercent ?? record.cv_metrics.mold_indicator_ratio ?? 0}%
                </div>
              </div>
              <div className="bg-stone-50 p-2 rounded-lg border border-stone-100">
                <div className="text-stone-400 text-[10px]">Roughness</div>
                <div className="font-mono font-bold text-stone-800">
                  {record.cv_metrics.surfaceRoughnessScore ?? record.cv_metrics.surface_roughness_score ?? 'N/A'}/10
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Model Specs */}
        <div className="text-[11px] text-stone-400 flex items-center justify-between pt-2 border-t border-stone-100">
          <span className="flex items-center space-x-1">
            <Cpu className="w-3 h-3 text-stone-400" />
            <span>{record.model_name} (v{record.model_version})</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-stone-900 text-white font-semibold text-xs hover:bg-stone-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
