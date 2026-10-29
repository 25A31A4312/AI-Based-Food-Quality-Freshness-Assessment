/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar, TabType } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { AnalyzeTab } from './components/AnalyzeTab';
import { HistoryTab } from './components/HistoryTab';
import { ReportsTab } from './components/ReportsTab';
import { ModelStatusTab } from './components/ModelStatusTab';
import { DetailModal } from './components/DetailModal';

import { AnalysisRecord, AnalysisResult, DashboardStats, ModelStatus, normalizeFreshnessClass } from './types';
import { fetchHistory, fetchModelStatus, checkBackendHealth } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean>(true);
  const [selectedRecord, setSelectedRecord] = useState<AnalysisRecord | null>(null);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);

  const sanitizeRecord = useCallback((r: AnalysisRecord): AnalysisRecord => {
    return {
      ...r,
      food_category: r.food_category || 'Unknown or unsupported category',
      freshness_classification: normalizeFreshnessClass(r.freshness_classification),
      confidence_score: +(Number(r.confidence_score) || 0).toFixed(1),
      visible_indicators: Array.isArray(r.visible_indicators) ? r.visible_indicators : [],
    };
  }, []);

  // Compute dashboard statistics from real records
  const computeStats = useCallback((currentRecords: AnalysisRecord[]): DashboardStats => {
    let freshCount = 0;
    let agingCount = 0;
    let spoiledCount = 0;
    let totalConfidence = 0;
    const categoryCounts: Record<string, number> = {};

    for (const r of currentRecords) {
      const cls = normalizeFreshnessClass(r.freshness_classification);
      if (cls === 'Fresh') freshCount++;
      else if (cls === 'Aging') agingCount++;
      else if (cls === 'Visibly Spoiled') spoiledCount++;

      totalConfidence += Number(r.confidence_score) || 0;

      const cat = r.food_category || 'Unknown';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }

    const total = currentRecords.length;
    const avgConfidence = total > 0 ? +(totalConfidence / total).toFixed(1) : 0;

    return {
      total,
      freshCount,
      agingCount,
      spoiledCount,
      avgConfidence,
      categoryCounts,
    };
  }, []);

  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    freshCount: 0,
    agingCount: 0,
    spoiledCount: 0,
    avgConfidence: 0,
    categoryCounts: {},
  });

  // Load history from backend
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetchHistory();
      const cleaned = (res.records || []).map(sanitizeRecord);
      setRecords(cleaned);
      setStats(computeStats(cleaned));
    } catch (err) {
      console.warn('Failed to load analysis history:', err);
    }
  }, [computeStats, sanitizeRecord]);

  // Load model status & health check
  const loadStatusAndHealth = useCallback(async () => {
    const health = await checkBackendHealth();
    setServerOnline(health.ok);
    try {
      const status = await fetchModelStatus();
      setModelStatus(status);
    } catch (err) {
      console.warn('Could not fetch model status:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      await Promise.all([loadHistory(), loadStatusAndHealth()]);
      setLoadingInitial(false);
    };
    init();
  }, [loadHistory, loadStatusAndHealth]);

  // Analysis completion callback
  const handleAnalysisSuccess = (result: AnalysisResult) => {
    const newRecord: AnalysisRecord = sanitizeRecord({
      id: result.id,
      timestamp: result.timestamp,
      food_category: result.food_category,
      freshness_classification: result.freshness_classification,
      confidence_score: result.confidence_score,
      visible_indicators: result.visible_warning_indicators || [],
      explanation: result.explanation,
      model_name: result.model_name,
      model_version: result.model_version,
      image_data: result.image_data,
      cv_metrics: result.cv_metrics,
    });

    setRecords((prev) => {
      const filteredPrev = prev.filter((item) => item.id !== newRecord.id);
      const updated = [newRecord, ...filteredPrev];
      setStats(computeStats(updated));
      return updated;
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        serverOnline={serverOnline}
        totalAnalyses={stats.total}
      />

      {/* Main Page Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'overview' && (
          <OverviewTab
            records={records}
            stats={stats}
            onNavigateToAnalyze={() => setActiveTab('analyze')}
            onNavigateToHistory={() => setActiveTab('history')}
            onSelectRecord={setSelectedRecord}
          />
        )}

        {activeTab === 'analyze' && (
          <AnalyzeTab
            onAnalysisSuccess={handleAnalysisSuccess}
            onViewHistory={() => setActiveTab('history')}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab
            records={records}
            onSelectRecord={setSelectedRecord}
            onRefreshHistory={loadHistory}
            onNavigateToAnalyze={() => setActiveTab('analyze')}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsTab
            records={records}
            stats={stats}
            onNavigateToAnalyze={() => setActiveTab('analyze')}
          />
        )}

        {activeTab === 'model' && (
          <ModelStatusTab
            modelStatus={modelStatus}
            serverOnline={serverOnline}
            onRefreshStatus={loadStatusAndHealth}
          />
        )}
      </main>

      {/* Record Inspection Modal */}
      <DetailModal
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white/80 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-2">
          <div>
            <strong className="text-stone-700">T238</strong> – AI-Based Food Quality & Freshness Assessment
          </div>
          <div>
            Computer Vision (OpenCV) • PyTorch (MobileNetV2 / ResNet-18) • Gemini 3.8 Flash Vision • SQLite
          </div>
        </div>
      </footer>
    </div>
  );
}
