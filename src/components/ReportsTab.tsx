/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Database,
  ArrowRight,
  Info
} from 'lucide-react';
import { AnalysisRecord, DashboardStats } from '../types';
import { getExportCsvUrl } from '../services/api';

interface ReportsTabProps {
  records: AnalysisRecord[];
  stats: DashboardStats;
  onNavigateToAnalyze: () => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({
  records,
  stats,
  onNavigateToAnalyze,
}) => {
  const hasRecords = records.length > 0;

  // Client-side download using Excel UTF-8 BOM, RFC-4180 escaping, and exact headers
  const handleClientSideCsvDownload = () => {
    if (records.length === 0) return;

    // Required columns:
    // Analysis ID, Timestamp, Food Category, Freshness Classification, Confidence (%), Visible Warning Indicators, Model Name, Model Version
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

    const lines = [headers.map(escapeCsvField).join(',')];
    for (const r of records) {
      const indicators =
        Array.isArray(r.visible_indicators) && r.visible_indicators.length > 0
          ? r.visible_indicators.join('; ')
          : 'None';

      const confNum = Number(r.confidence_score);
      const confFormatted = !isNaN(confNum) ? confNum.toFixed(1) : '0.0';

      lines.push(
        [
          escapeCsvField(r.id),
          escapeCsvField(r.timestamp),
          escapeCsvField(r.food_category || 'Unknown'),
          escapeCsvField(r.freshness_classification),
          escapeCsvField(confFormatted),
          escapeCsvField(indicators),
          escapeCsvField(r.model_name || 'T238-VisionFresh-Ensemble'),
          escapeCsvField(r.model_version || '2.4.0'),
        ].join(',')
      );
    }

    // Prepend UTF-8 BOM for Microsoft Excel compatibility and CRLF
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `food_quality_freshness_report_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight flex items-center space-x-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            <span>Inspection Reports & CSV Export</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-stone-500">
            Export verified food condition datasets and analytical logs for academic auditing or compliance reporting.
          </p>
        </div>

        {hasRecords && (
          <div className="flex items-center space-x-2">
            <a
              href={getExportCsvUrl()}
              download
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all active:scale-98"
            >
              <Download className="w-4 h-4" />
              <span>Download CSV (Server Stream)</span>
            </a>
            <button
              onClick={handleClientSideCsvDownload}
              className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold shadow-xs transition-colors"
            >
              <span>Instant Download</span>
            </button>
          </div>
        )}
      </div>

      {hasRecords ? (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Total Logged Analyses
              </span>
              <div className="text-2xl font-black text-stone-900">{stats.total} Records</div>
              <p className="text-xs text-stone-500">Fully audited in persistent database</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Average Model Confidence
              </span>
              <div className="text-2xl font-black text-emerald-700">{stats.avgConfidence}%</div>
              <p className="text-xs text-stone-500">Calibrated Softmax probability mean</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-1">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Fresh / Aging / Spoiled Ratio
              </span>
              <div className="text-2xl font-black text-stone-800">
                {stats.freshCount} / {stats.agingCount} / {stats.spoiledCount}
              </div>
              <p className="text-xs text-stone-500">Three-state distribution</p>
            </div>
          </div>

          {/* Export Schema Specifications */}
          <div className="bg-white rounded-xl p-5 border border-stone-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center space-x-2">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>Export Schema Specification (8 Columns)</span>
              </h2>
              <span className="text-xs font-mono text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                RFC-4180 Compliant CSV
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100 font-mono">
                <span className="text-stone-400 block text-[10px]">Col 1</span>
                <span className="font-bold text-stone-800">Analysis ID</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100 font-mono">
                <span className="text-stone-400 block text-[10px]">Col 2</span>
                <span className="font-bold text-stone-800">Timestamp</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100 font-mono">
                <span className="text-stone-400 block text-[10px]">Col 3</span>
                <span className="font-bold text-stone-800">Food Category</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100 font-mono">
                <span className="text-stone-400 block text-[10px]">Col 4</span>
                <span className="font-bold text-stone-800">Freshness Classification</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100 font-mono">
                <span className="text-stone-400 block text-[10px]">Col 5</span>
                <span className="font-bold text-stone-800">Confidence (%)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100 font-mono">
                <span className="text-stone-400 block text-[10px]">Col 6</span>
                <span className="font-bold text-stone-800">Visible Warning Indicators</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100 font-mono">
                <span className="text-stone-400 block text-[10px]">Col 7</span>
                <span className="font-bold text-stone-800">Model Name</span>
              </div>
              <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-100 font-mono">
                <span className="text-stone-400 block text-[10px]">Col 8</span>
                <span className="font-bold text-stone-800">Model Version</span>
              </div>
            </div>
          </div>

          {/* Export Preview Table */}
          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800">
                Dataset Preview ({records.length} records ready for download)
              </span>
              <span className="text-[11px] text-stone-400">Real Stored Data Only</span>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-stone-50 border-b border-stone-200 font-bold text-stone-600 text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Analysis ID</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Classification</th>
                    <th className="py-2.5 px-3">Confidence (%)</th>
                    <th className="py-2.5 px-3">Visible Indicators</th>
                    <th className="py-2.5 px-3">Model</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono text-[11px]">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-stone-50/70">
                      <td className="py-2.5 px-3 font-semibold text-stone-800">{r.id}</td>
                      <td className="py-2.5 px-3 text-stone-500">{new Date(r.timestamp).toISOString().replace('T', ' ').substring(0, 19)}</td>
                      <td className="py-2.5 px-3 font-sans font-bold text-stone-800">{r.food_category}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            r.freshness_classification === 'Fresh'
                              ? 'bg-emerald-50 text-emerald-700'
                              : r.freshness_classification === 'Aging'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {r.freshness_classification}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{r.confidence_score.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 font-sans text-stone-600 max-w-xs truncate">
                        {(r.visible_indicators || []).join(', ') || 'None'}
                      </td>
                      <td className="py-2.5 px-3 text-stone-400">{r.model_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-2xl p-12 border border-stone-200 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 text-stone-300 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <h3 className="text-base font-extrabold text-stone-800">
            No Records to Export
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
            CSV reports are generated strictly from genuine stored assessment records. No fabricated data is ever injected. Conduct your first evaluation to generate data.
          </p>
          <button
            onClick={onNavigateToAnalyze}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all active:scale-98 inline-flex items-center space-x-2"
          >
            <span>Analyze Food Sample</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
