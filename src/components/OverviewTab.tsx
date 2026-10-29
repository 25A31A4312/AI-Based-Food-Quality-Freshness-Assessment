/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Activity,
  Layers,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  BarChart3,
  Calendar,
} from 'lucide-react';
import { AnalysisRecord, DashboardStats } from '../types';

interface OverviewTabProps {
  records: AnalysisRecord[];
  stats: DashboardStats;
  onNavigateToAnalyze: () => void;
  onNavigateToHistory: () => void;
  onSelectRecord: (record: AnalysisRecord) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  records,
  stats,
  onNavigateToAnalyze,
  onNavigateToHistory,
  onSelectRecord,
}) => {
  const hasRecords = records.length > 0;

  const freshPercent = hasRecords ? Math.round((stats.freshCount / stats.total) * 100) : 0;
  const agingPercent = hasRecords ? Math.round((stats.agingCount / stats.total) * 100) : 0;
  const spoiledPercent = hasRecords ? Math.round((stats.spoiledCount / stats.total) * 100) : 0;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-stone-900 via-stone-800 to-emerald-950 text-white p-6 sm:p-8 shadow-xl min-h-[260px] flex items-center">
        {/* Left Content Column */}
        <div className="relative z-10 max-w-xl lg:max-w-2xl py-1">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 mb-3 backdrop-blur-xs">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Computer Vision & Deep Learning Inspection System</span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight drop-shadow-xs">
            T238 – Food Quality & Freshness Assessment
          </h1>
          <p className="mt-2 text-stone-300 text-sm sm:text-base leading-relaxed drop-shadow-xs">
            Real-time visual decay detection and freshness categorization using multi-scale convolutional feature extraction, calibrated confidence scoring, and surface defect analysis.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={onNavigateToAnalyze}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-sm transition-all shadow-lg shadow-emerald-500/25 active:scale-98 cursor-pointer"
            >
              <span>Analyze Food Sample</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            {hasRecords && (
              <button
                onClick={onNavigateToHistory}
                className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-sm transition-all border border-white/10 backdrop-blur-xs cursor-pointer"
              >
                <span>View {stats.total} Records</span>
              </button>
            )}
          </div>
        </div>

        {/* AI in Food Industry Visual Background on Right */}
        <div className="absolute right-0 top-0 bottom-0 w-full sm:w-3/4 md:w-3/5 lg:w-[56%] pointer-events-none overflow-hidden flex items-center justify-end z-0">
          <img
            src="/assets/aistudio/AI-Powered-Food-Production_24435c65.webp"
            alt="AI in Food Industry Production, Quality and Food Safety"
            className="w-full h-full object-cover object-right opacity-30 sm:opacity-50 lg:opacity-52 select-none"
            style={{
              maskImage: 'linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.2) 10%, rgba(0, 0, 0, 0.8) 32%, rgba(0, 0, 0, 1) 60%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.2) 10%, rgba(0, 0, 0, 0.8) 32%, rgba(0, 0, 0, 1) 60%)',
            }}
          />
          {/* Subtle dark green gradient overlays to blend naturally without heavy blackness */}
          <div className="absolute inset-0 bg-gradient-to-r from-stone-900/90 via-emerald-950/30 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/40 via-transparent to-emerald-950/20 pointer-events-none" />
        </div>
      </div>

      {/* KPI Cards: Real statistics from database */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Analyses */}
        <div className="bg-white rounded-xl p-5 border border-stone-200 shadow-xs hover:border-stone-300 transition-all">
          <div className="flex items-center justify-between text-stone-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Evaluated</span>
            <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-stone-900">{stats.total}</div>
          <p className="mt-1 text-xs text-stone-500">
            {hasRecords ? 'Recorded in SQLite store' : 'No analyses logged yet'}
          </p>
        </div>

        {/* Fresh Count */}
        <div className="bg-white rounded-xl p-5 border border-emerald-100 shadow-xs hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between text-emerald-700 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Fresh Items</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-emerald-700">{stats.freshCount}</span>
            {hasRecords && (
              <span className="text-xs font-semibold text-emerald-600">({freshPercent}%)</span>
            )}
          </div>
          <p className="mt-1 text-xs text-stone-500">Firm, natural color, intact skin</p>
        </div>

        {/* Aging Count */}
        <div className="bg-white rounded-xl p-5 border border-amber-100 shadow-xs hover:border-amber-200 transition-all">
          <div className="flex items-center justify-between text-amber-700 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Aging Items</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-amber-700">{stats.agingCount}</span>
            {hasRecords && (
              <span className="text-xs font-semibold text-amber-600">({agingPercent}%)</span>
            )}
          </div>
          <p className="mt-1 text-xs text-stone-500">Minor shriveling, browning, softening</p>
        </div>

        {/* Visibly Spoiled Count */}
        <div className="bg-white rounded-xl p-5 border border-rose-100 shadow-xs hover:border-rose-200 transition-all">
          <div className="flex items-center justify-between text-rose-700 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Visibly Spoiled</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-rose-700">{stats.spoiledCount}</span>
            {hasRecords && (
              <span className="text-xs font-semibold text-rose-600">({spoiledPercent}%)</span>
            )}
          </div>
          <p className="mt-1 text-xs text-stone-500">Mold patterns, rot, dark necrosis</p>
        </div>
      </div>

      {/* Freshness Ratio Bar (only when real records exist) */}
      {hasRecords && (
        <div className="bg-white rounded-xl p-5 border border-stone-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-stone-900 flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <span>Dataset Freshness Proportions</span>
            </span>
            <span className="text-xs text-stone-500">
              Average Confidence: <strong className="text-stone-800">{stats.avgConfidence}%</strong>
            </span>
          </div>

          <div className="w-full h-3 rounded-full bg-stone-100 overflow-hidden flex">
            {stats.freshCount > 0 && (
              <div
                style={{ width: `${freshPercent}%` }}
                className="bg-emerald-500 h-full transition-all"
                title={`Fresh: ${stats.freshCount} (${freshPercent}%)`}
              />
            )}
            {stats.agingCount > 0 && (
              <div
                style={{ width: `${agingPercent}%` }}
                className="bg-amber-400 h-full transition-all"
                title={`Aging: ${stats.agingCount} (${agingPercent}%)`}
              />
            )}
            {stats.spoiledCount > 0 && (
              <div
                style={{ width: `${spoiledPercent}%` }}
                className="bg-rose-500 h-full transition-all"
                title={`Visibly Spoiled: ${stats.spoiledCount} (${spoiledPercent}%)`}
              />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-stone-600 font-medium">Fresh ({freshPercent}%)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-stone-600 font-medium">Aging ({agingPercent}%)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-stone-600 font-medium">Visibly Spoiled ({spoiledPercent}%)</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Split: Categories & Recent Analyses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Categories Identified */}
        <div className="bg-white rounded-xl p-5 border border-stone-200 shadow-xs lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-stone-900 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-stone-500" />
              <span>Evaluated Categories</span>
            </h2>
            <span className="text-xs text-stone-400">
              {Object.keys(stats.categoryCounts).length} types
            </span>
          </div>

          {Object.keys(stats.categoryCounts).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.categoryCounts).map(([cat, count]) => {
                const pct = Math.round((count / stats.total) * 100);
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-stone-700">{cat}</span>
                      <span className="text-stone-500">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-stone-100 overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="bg-emerald-500 h-full rounded-full transition-all"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-stone-400">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No food categories tested yet.</p>
            </div>
          )}
        </div>

        {/* Recent Analyses Activity */}
        <div className="bg-white rounded-xl p-5 border border-stone-200 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-stone-900 flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <span>Recent Evaluations</span>
            </h2>
            {hasRecords && (
              <button
                onClick={onNavigateToHistory}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                View All
              </button>
            )}
          </div>

          {hasRecords ? (
            <div className="divide-y divide-stone-100">
              {records.slice(0, 5).map((rec) => {
                const isFresh = rec.freshness_classification === 'Fresh';
                const isAging = rec.freshness_classification === 'Aging';
                const badgeColor = isFresh
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isAging
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200';

                return (
                  <div
                    key={rec.id}
                    onClick={() => onSelectRecord(rec)}
                    className="py-3 flex items-center justify-between hover:bg-stone-50/80 px-2 -mx-2 rounded-lg cursor-pointer transition-colors"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      {rec.image_data ? (
                        <img
                          src={rec.image_data}
                          alt={rec.food_category}
                          className="w-10 h-10 rounded-lg object-cover border border-stone-200 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center text-stone-400 shrink-0">
                          <Activity className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-stone-800 truncate">
                            {rec.food_category}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeColor}`}
                          >
                            {rec.freshness_classification}
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-500 truncate flex items-center space-x-2 mt-0.5">
                          <span className="font-mono text-stone-400">{rec.id}</span>
                          <span>•</span>
                          <span className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3 text-stone-400" />
                            <span>{new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right pl-3 shrink-0">
                      <div className="text-xs font-extrabold text-stone-800">
                        {rec.confidence_score.toFixed(1)}%
                      </div>
                      <span className="text-[10px] text-stone-400 font-medium">Confidence</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-stone-400">
              <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-semibold text-stone-600">No Assessment Records Yet</p>
              <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
                Upload or select a food sample in the Analyze Food tab to run Computer Vision classification.
              </p>
              <button
                onClick={onNavigateToAnalyze}
                className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-700 transition-colors shadow-sm"
              >
                Analyze First Food Image
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Food Safety & Regulatory Advisory */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 flex items-start space-x-3.5">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <strong className="font-bold text-amber-950 block mb-0.5">
            Food Safety & Optical Inspection Boundary Limitation
          </strong>
          This system evaluates visible external surface defects (necrosis, discoloration, wrinkles, and superficial fungal mycelium). It cannot detect internal bacterial pathogens (e.g. <em>Salmonella</em>, <em>Listeria</em>, <em>E. coli</em>), chemical residues, or anaerobic spoilage. Always follow standard food hygiene and do not consume food exhibiting off-odors, abnormal texture, or known unsafe storage conditions regardless of visual classification.
        </div>
      </div>
    </div>
  );
};
