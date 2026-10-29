/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  History,
  Trash2,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  AlertOctagon,
  Download,
  XCircle
} from 'lucide-react';
import { AnalysisRecord, FreshnessClass, normalizeFreshnessClass } from '../types';
import { clearHistory, getExportCsvUrl } from '../services/api';

interface HistoryTabProps {
  records: AnalysisRecord[];
  onSelectRecord: (record: AnalysisRecord) => void;
  onRefreshHistory: () => void;
  onNavigateToAnalyze: () => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  records,
  onSelectRecord,
  onRefreshHistory,
  onNavigateToAnalyze,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [freshnessFilter, setFreshnessFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [clearError, setClearError] = useState<string | null>(null);

  // Extract unique food categories present in records
  const uniqueCategories = Array.from(
    new Set(records.map((r) => r.food_category).filter(Boolean))
  );

  // Reset category filter if cleared or category is no longer present
  useEffect(() => {
    if (categoryFilter !== 'ALL' && !uniqueCategories.includes(categoryFilter)) {
      setCategoryFilter('ALL');
    }
  }, [categoryFilter, uniqueCategories]);

  // Filter records safely across ID, Category, Condition, and Visible Indicators
  const normalizedQuery = searchTerm.trim().toLowerCase();
  const filteredRecords = records.filter((r) => {
    const idStr = String(r.id || '').toLowerCase();
    const catStr = String(r.food_category || '').toLowerCase();
    const normalizedFreshness = normalizeFreshnessClass(r.freshness_classification);
    const freshStr = normalizedFreshness.toLowerCase();
    const indicatorsList = Array.isArray(r.visible_indicators) ? r.visible_indicators : [];

    const matchesSearch =
      !normalizedQuery ||
      idStr.includes(normalizedQuery) ||
      catStr.includes(normalizedQuery) ||
      freshStr.includes(normalizedQuery) ||
      indicatorsList.some((ind) => String(ind || '').toLowerCase().includes(normalizedQuery));

    const matchesFreshness =
      freshnessFilter === 'ALL' || normalizedFreshness === freshnessFilter;

    const matchesCategory =
      categoryFilter === 'ALL' || r.food_category === categoryFilter;

    return matchesSearch && matchesFreshness && matchesCategory;
  });

  const handleConfirmClear = async () => {
    setIsDeleting(true);
    setClearError(null);
    try {
      await clearHistory();
      setShowDeleteModal(false);
      setSearchTerm('');
      setFreshnessFilter('ALL');
      setCategoryFilter('ALL');
      onRefreshHistory();
    } catch (err: any) {
      setClearError('Failed to clear history: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const getFreshnessBadge = (classification: FreshnessClass) => {
    switch (normalizeFreshnessClass(classification)) {
      case 'Fresh':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Fresh</span>
          </span>
        );
      case 'Aging':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>Aging</span>
          </span>
        );
      case 'Visibly Spoiled':
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>Visibly Spoiled</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight flex items-center space-x-2">
            <History className="w-6 h-6 text-emerald-600" />
            <span>Analysis History</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-stone-500">
            Persistent log of completed food freshness evaluations stored in SQLite ({records.length} records).
          </p>
        </div>

        {records.length > 0 && (
          <div className="flex items-center space-x-2">
            <a
              href={getExportCsvUrl()}
              download
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-stone-500" />
              <span>Export CSV</span>
            </a>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          </div>
        )}
      </div>

      {records.length > 0 ? (
        <>
          {/* Filters & Search Toolbar */}
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by ID, Food Category, or Freshness..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-stone-200 text-xs focus:outline-emerald-500"
              />
            </div>

            {/* Freshness Filter */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-stone-500 font-medium">Condition:</span>
              <select
                value={freshnessFilter}
                onChange={(e) => setFreshnessFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-medium bg-white focus:outline-emerald-500"
              >
                <option value="ALL">All Conditions</option>
                <option value="Fresh">Fresh</option>
                <option value="Aging">Aging</option>
                <option value="Visibly Spoiled">Visibly Spoiled</option>
              </select>
            </div>

            {/* Category Filter */}
            {uniqueCategories.length > 0 && (
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-stone-500 font-medium">Category:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-medium bg-white focus:outline-emerald-500"
                >
                  <option value="ALL">All Categories</option>
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Records Table / List */}
          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Food Item</th>
                    <th className="py-3 px-4">Freshness State</th>
                    <th className="py-3 px-4">Confidence</th>
                    <th className="py-3 px-4">Visible Indicators</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredRecords.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => onSelectRecord(r)}
                      className="hover:bg-stone-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          {r.image_data ? (
                            <img
                              src={r.image_data}
                              alt={r.food_category}
                              className="w-10 h-10 rounded-lg object-cover border border-stone-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center text-stone-400 shrink-0">
                              <History className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <div className="font-extrabold text-stone-900">{r.food_category}</div>
                            <div className="text-[10px] font-mono text-stone-400">{r.id}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {getFreshnessBadge(r.freshness_classification)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-extrabold text-stone-800">
                          {(Number(r.confidence_score) || 0).toFixed(1)}%
                        </div>
                        <div className="w-16 h-1 rounded-full bg-stone-100 overflow-hidden mt-1">
                          <div
                            style={{ width: `${Math.min(100, Math.max(0, Number(r.confidence_score) || 0))}%` }}
                            className={`h-full rounded-full ${
                              normalizeFreshnessClass(r.freshness_classification) === 'Fresh'
                                ? 'bg-emerald-500'
                                : normalizeFreshnessClass(r.freshness_classification) === 'Aging'
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                          />
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {r.visible_indicators && r.visible_indicators.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {r.visible_indicators.map((ind, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-700 border border-stone-200"
                              >
                                {ind}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-stone-400 italic text-[11px]">None</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-stone-500 font-mono text-[11px]">
                        {new Date(r.timestamp).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRecord(r);
                          }}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors inline-flex items-center space-x-1"
                        >
                          <span>Inspect</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredRecords.length === 0 && (
              <div className="py-8 text-center text-stone-400 text-xs">
                No matching records found for the active filter criteria.
              </div>
            )}
          </div>
        </>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-2xl p-12 border border-stone-200 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 text-stone-300 flex items-center justify-center mx-auto">
            <History className="w-8 h-8" />
          </div>
          <h3 className="text-base font-extrabold text-stone-800">
            Analysis History is Empty
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
            No food inspection records have been recorded yet. Stored analyses will persist in SQLite and can be viewed or exported as CSV at any time.
          </p>
          <button
            onClick={onNavigateToAnalyze}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all active:scale-98"
          >
            Run an Assessment Now
          </button>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-extrabold text-stone-900">
                Clear All Analysis History?
              </h3>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                This action will permanently delete all {records.length} saved assessment records from the SQLite database. This operation cannot be undone.
              </p>
            </div>
            {clearError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{clearError}</span>
              </div>
            )}
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 rounded-lg border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-xs"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
