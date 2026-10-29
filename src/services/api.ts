/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AnalysisRecord, AnalysisResult, ModelStatus } from '../types';

export const API_BASE = '/api';

export async function checkBackendHealth(targetUrl: string = ''): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const url = targetUrl ? `${targetUrl}/health` : `${API_BASE}/health`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unable to connect' };
  }
}

export async function fetchModelStatus(targetUrl: string = ''): Promise<ModelStatus> {
  const url = targetUrl ? `${targetUrl}/model/status` : `${API_BASE}/model/status`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load model status: ${res.statusText}`);
  }
  return res.json();
}

export async function analyzeFood(
  imageBase64: string,
  mimeType: string,
  confidenceThreshold: number,
  engineType: 'server' | 'python',
  pythonApiUrl: string = 'http://localhost:8000'
): Promise<AnalysisResult> {
  if (engineType === 'python') {
    // Send to local Python FastAPI backend using multipart/form-data
    const blob = await (await fetch(imageBase64)).blob();
    const formData = new FormData();
    formData.append('file', blob, 'food_sample.jpg');
    formData.append('confidence_threshold', confidenceThreshold.toString());

    const res = await fetch(`${pythonApiUrl}/analyze`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: 'Python backend analysis failed' }));
      throw new Error(errData.detail || `Server returned error ${res.status}`);
    }

    const data = await res.json();
    return {
      ...data,
      image_data: imageBase64,
    };
  }

  // Built-in Express full-stack API
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
      mimeType,
      confidenceThreshold,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Analysis failed' }));
    throw new Error(errData.error || `Server returned error ${res.status}`);
  }

  const result = await res.json();
  return {
    ...result,
    image_data: imageBase64,
  };
}

export async function fetchHistory(): Promise<{ total: number; records: AnalysisRecord[] }> {
  const res = await fetch(`${API_BASE}/history`);
  if (!res.ok) {
    throw new Error('Failed to retrieve analysis history');
  }
  return res.json();
}

export async function fetchHistoryById(id: string): Promise<AnalysisRecord> {
  const res = await fetch(`${API_BASE}/history/${id}`);
  if (!res.ok) {
    throw new Error(`Analysis record ${id} not found`);
  }
  return res.json();
}

export async function clearHistory(): Promise<{ message: string; deleted_count: number }> {
  const res = await fetch(`${API_BASE}/history`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to clear history');
  }
  return res.json();
}

export function getExportCsvUrl(): string {
  return `${API_BASE}/export/csv`;
}
