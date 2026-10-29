/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  RefreshCw,
  Sliders,
  ShieldAlert,
  ChevronRight,
  Info,
  Server,
  Layers,
  ArrowRight,
  XCircle,
  FileCheck
} from 'lucide-react';
import { AnalysisResult, FreshnessClass, normalizeFreshnessClass } from '../types';
import { analyzeFood } from '../services/api';
import { getSampleFoods, SampleFoodItem } from '../data/sampleFoods';

interface AnalyzeTabProps {
  onAnalysisSuccess: (result: AnalysisResult) => void;
  onViewHistory: () => void;
}

export const AnalyzeTab: React.FC<AnalyzeTabProps> = ({
  onAnalysisSuccess,
  onViewHistory,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [fileDetails, setFileDetails] = useState<{ name: string; size: string } | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(70);
  const [engineType, setEngineType] = useState<'server' | 'python'>('server');
  const [pythonUrl, setPythonUrl] = useState<string>('http://localhost:8000');

  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleFoods = getSampleFoods();

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setErrorMessage(null);
    setCurrentResult(null);

    // Validate type
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validMimes.includes(file.type)) {
      setErrorMessage(`Unsupported file format (${file.type || 'unknown'}). Please upload JPG, PNG, or WEBP.`);
      return;
    }

    // Validate size (max 12MB)
    const maxSize = 12 * 1024 * 1024;
    if (file.size > maxSize) {
      setErrorMessage(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max size is 12MB.`);
      return;
    }

    const normalizedMime = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
    setMimeType(normalizedMime);
    setFileDetails({
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
    });

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read the selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSelectSample = (sample: SampleFoodItem) => {
    setErrorMessage(null);
    setCurrentResult(null);
    setSelectedImage(sample.dataUrl);
    setMimeType('image/jpeg');
    setFileDetails({
      name: `${sample.name}.jpg`,
      size: 'Sample Food Benchmark',
    });
  };

  const handleClearImage = () => {
    setSelectedImage(null);
    setFileDetails(null);
    setCurrentResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRunAnalysis = async () => {
    if (!selectedImage) {
      setErrorMessage('Please select or upload a food image first.');
      return;
    }

    setAnalyzing(true);
    setErrorMessage(null);

    try {
      setAnalysisStep('Running optical defect segmentation & multimodal classification...');
      const rawResult = await analyzeFood(
        selectedImage,
        mimeType,
        confidenceThreshold,
        engineType,
        pythonUrl
      );

      const normalizedResult: AnalysisResult = {
        ...rawResult,
        freshness_classification: normalizeFreshnessClass(rawResult.freshness_classification),
        confidence_score: +(Number(rawResult.confidence_score) || 0).toFixed(1),
        visible_warning_indicators: Array.isArray(rawResult.visible_warning_indicators)
          ? rawResult.visible_warning_indicators
          : [],
      };

      setCurrentResult(normalizedResult);
      onAnalysisSuccess(normalizedResult);
    } catch (err: any) {
      console.error(err);
      if (engineType === 'python') {
        setErrorMessage(
          `Failed to connect to Python FastAPI backend at ${pythonUrl}. Ensure 'uvicorn app:app --port 8000' is running locally, or switch engine to 'Server Vision AI Engine'.`
        );
      } else {
        setErrorMessage(err.message || 'An error occurred during food freshness assessment.');
      }
    } finally {
      setAnalyzing(false);
      setAnalysisStep('');
    }
  };

  // Helper styles for freshness badge
  const getBadgeStyle = (category: FreshnessClass) => {
    switch (normalizeFreshnessClass(category)) {
      case 'Fresh':
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-300',
          icon: CheckCircle2,
          color: 'text-emerald-600',
          label: 'Fresh Condition',
        };
      case 'Aging':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-300',
          icon: Clock,
          color: 'text-amber-600',
          label: 'Aging / Senescent',
        };
      case 'Visibly Spoiled':
      default:
        return {
          bg: 'bg-rose-50 text-rose-800 border-rose-300',
          icon: AlertTriangle,
          color: 'text-rose-600',
          label: 'Visibly Spoiled',
        };
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header section */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight">
          Food Quality & Freshness Assessment
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-stone-500">
          Upload an image of produce or food items to classify freshness (Fresh, Aging, Visibly Spoiled), identify category, and report visible decay traits.
        </p>
      </div>

      {/* Main Grid: Upload & Controls / Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Image Upload & Parameters (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Engine & Configuration Settings */}
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
              <span className="flex items-center space-x-1.5">
                <Server className="w-3.5 h-3.5 text-emerald-600" />
                <span>Inference Engine</span>
              </span>
              <span className="text-[11px] text-stone-400">Model Pipeline Selection</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setEngineType('server')}
                className={`py-2 px-3 rounded-lg border text-left font-medium transition-all ${
                  engineType === 'server'
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 shadow-xs'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>Server Vision AI</span>
                  {engineType === 'server' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">
                  Gemini 3.8 Flash + CV Heuristics (Ready)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEngineType('python')}
                className={`py-2 px-3 rounded-lg border text-left font-medium transition-all ${
                  engineType === 'python'
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 shadow-xs'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>Local Python FastAPI</span>
                  {engineType === 'python' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">
                  PyTorch MobileNet/ResNet-18 (port 8000)
                </div>
              </button>
            </div>

            {engineType === 'python' && (
              <div className="pt-2 border-t border-stone-100 flex items-center space-x-2 text-xs">
                <span className="text-stone-500 text-[11px] shrink-0">FastAPI Host:</span>
                <input
                  type="text"
                  value={pythonUrl}
                  onChange={(e) => setPythonUrl(e.target.value)}
                  className="flex-1 px-2.5 py-1 text-xs border border-stone-200 rounded-md font-mono focus:outline-emerald-500"
                  placeholder="http://localhost:8000"
                />
              </div>
            )}
          </div>

          {/* Upload Area */}
          <div className="bg-white rounded-xl p-5 border border-stone-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center space-x-1.5">
                <ImageIcon className="w-4 h-4 text-emerald-600" />
                <span>Upload Food Image</span>
              </span>
              {selectedImage && (
                <button
                  onClick={handleClearImage}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                >
                  Remove Image
                </button>
              )}
            </div>

            {selectedImage ? (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden border border-stone-200 bg-stone-900/5 aspect-video sm:aspect-4/3 flex items-center justify-center">
                  <img
                    src={selectedImage}
                    alt="Food preview"
                    className="max-h-full max-w-full object-contain mx-auto"
                  />
                  <div className="absolute bottom-2 left-2 bg-stone-900/80 backdrop-blur-xs text-white text-[11px] px-2.5 py-1 rounded-md flex items-center space-x-2">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{fileDetails?.name || 'food_sample.jpg'}</span>
                    <span className="text-stone-400">({fileDetails?.size})</span>
                  </div>
                </div>

                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
                  >
                    Replace Image
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-stone-300 hover:border-emerald-500 rounded-xl p-8 text-center cursor-pointer transition-all bg-stone-50/50 hover:bg-emerald-50/20 group"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-100/70 text-emerald-700 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-stone-800">
                  Click to browse or drag and drop image here
                </p>
                <p className="text-xs text-stone-500 mt-1">
                  Supports JPG, JPEG, PNG, WEBP (Max: 12MB)
                </p>
                <div className="mt-3 inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-stone-200/60 text-stone-600 text-[11px] font-medium">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>Optimal: clear lighting & full item visibility</span>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {/* Benchmark Sample Test Foods */}
            <div className="pt-3 border-t border-stone-100">
              <div className="text-xs font-bold text-stone-700 mb-2 flex items-center justify-between">
                <span>Or Select Benchmark Sample Food:</span>
                <span className="text-[10px] text-stone-400 font-normal">Quick 1-click test</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sampleFoods.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => handleSelectSample(sample)}
                    className="p-2 rounded-lg border border-stone-200 hover:border-emerald-400 bg-stone-50/60 hover:bg-white text-left transition-all group flex items-center space-x-2"
                  >
                    <img
                      src={sample.dataUrl}
                      alt={sample.name}
                      className="w-8 h-8 rounded-md object-cover border border-stone-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-stone-800 truncate group-hover:text-emerald-700">
                        {sample.name}
                      </div>
                      <div className="text-[10px] text-stone-500 truncate">
                        {sample.expectedClass}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Configurable Confidence Threshold */}
          <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-stone-800 flex items-center space-x-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                <span>Confidence Warning Threshold</span>
              </span>
              <span className="font-mono font-bold text-emerald-700 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200">
                {confidenceThreshold}%
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              step="1"
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <p className="text-[11px] text-stone-500 leading-tight">
              Predictions falling below {confidenceThreshold}% confidence will be tagged with a caution banner:
              <em> “Uncertain prediction — further inspection required.”</em>
            </p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-start space-x-2">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <strong className="font-bold block">Assessment Error</strong>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleRunAnalysis}
            disabled={!selectedImage || analyzing}
            className={`w-full py-3 px-4 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center space-x-2 ${
              !selectedImage || analyzing
                ? 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25 active:scale-98'
            }`}
          >
            {analyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Evaluating Image ({analysisStep || 'Processing'})...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Run Freshness & Quality Assessment</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Analysis Results Display (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {currentResult ? (
            <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-md space-y-5 animate-scaleUp">
              {/* Header Badge */}
              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                  Assessment Report
                </span>
                <span className="text-[11px] font-mono text-stone-400">
                  {currentResult.id}
                </span>
              </div>

              {/* Freshness Classification Pill */}
              {(() => {
                const style = getBadgeStyle(currentResult.freshness_classification);
                const Icon = style.icon;
                return (
                  <div
                    className={`p-4 rounded-xl border ${style.bg} flex items-center justify-between`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg bg-white/80 shadow-xs ${style.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-[11px] uppercase font-bold tracking-wider opacity-75">
                          Freshness State
                        </div>
                        <div className="text-lg font-black">{currentResult.freshness_classification}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black">{currentResult.confidence_score.toFixed(1)}%</div>
                      <div className="text-[10px] font-medium opacity-80">Model Confidence</div>
                    </div>
                  </div>
                );
              })()}

              {/* Low Confidence Warning */}
              {currentResult.is_low_confidence && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Uncertain prediction</strong> — confidence ({currentResult.confidence_score}%) is below your threshold ({currentResult.confidence_threshold_applied}%). Further inspection recommended.
                  </span>
                </div>
              )}

              {/* Food Category Identified */}
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
                <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                  Detected Food Category
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-base font-extrabold text-stone-900">
                    {currentResult.food_category}
                  </span>
                  {currentResult.food_category !== 'Unknown or unsupported category' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Supported Class
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-200 text-stone-700">
                      Unclassified Food
                    </span>
                  )}
                </div>
              </div>

              {/* Visible Defect Indicators */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
                  <Layers className="w-3.5 h-3.5 text-stone-500" />
                  <span>Visible Warning Indicators</span>
                </span>
                {currentResult.visible_warning_indicators &&
                currentResult.visible_warning_indicators.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {currentResult.visible_warning_indicators.map((indicator, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 text-stone-800 border border-stone-200 flex items-center space-x-1"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        <span>{indicator}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200/60 text-emerald-800 text-xs flex items-center space-x-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>No visible surface defects or mold indicators detected.</span>
                  </div>
                )}
              </div>

              {/* Technical Explanation */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-stone-800 flex items-center space-x-1.5">
                  <Info className="w-3.5 h-3.5 text-stone-500" />
                  <span>Visible Signs & Feature Analysis</span>
                </span>
                <p className="text-xs text-stone-600 leading-relaxed bg-stone-50 p-3 rounded-lg border border-stone-200">
                  {currentResult.explanation}
                </p>
              </div>

              {/* Computer Vision Metrics Breakdown */}
              {currentResult.cv_metrics && (
                <div className="space-y-2 pt-2 border-t border-stone-100">
                  <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                    Surface Optical Indices
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-stone-50 p-2 rounded-lg border border-stone-100">
                      <div className="text-stone-400 text-[10px]">Browning</div>
                      <div className="font-mono font-bold text-stone-800">
                        {currentResult.cv_metrics.browningNecrosisPercent ?? currentResult.cv_metrics.browning_percent ?? 0}%
                      </div>
                    </div>
                    <div className="bg-stone-50 p-2 rounded-lg border border-stone-100">
                      <div className="text-stone-400 text-[10px]">Dark Spots</div>
                      <div className="font-mono font-bold text-stone-800">
                        {currentResult.cv_metrics.darkSpotAreaPercent ?? currentResult.cv_metrics.dark_spot_percent ?? 0}%
                      </div>
                    </div>
                    <div className="bg-stone-50 p-2 rounded-lg border border-stone-100">
                      <div className="text-stone-400 text-[10px]">Mold Ratio</div>
                      <div className="font-mono font-bold text-stone-800">
                        {currentResult.cv_metrics.moldIndicatorPercent ?? currentResult.cv_metrics.mold_indicator_ratio ?? 0}%
                      </div>
                    </div>
                    <div className="bg-stone-50 p-2 rounded-lg border border-stone-100">
                      <div className="text-stone-400 text-[10px]">Roughness</div>
                      <div className="font-mono font-bold text-stone-800">
                        {currentResult.cv_metrics.surfaceRoughnessScore ?? currentResult.cv_metrics.surface_roughness_score ?? 'N/A'}/10
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Timestamp & Model Name */}
              <div className="flex items-center justify-between text-[11px] text-stone-400 pt-2 border-t border-stone-100">
                <span>Model: {currentResult.model_name} (v{currentResult.model_version})</span>
                <span>{new Date(currentResult.timestamp).toLocaleTimeString()}</span>
              </div>

              {/* Food Safety Notice */}
              <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] flex items-start space-x-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Safety Notice:</strong> {currentResult.food_safety_disclaimer}
                </span>
              </div>

              {/* Post-Analysis Action Buttons */}
              <div className="flex items-center space-x-2 pt-1">
                <button
                  onClick={handleClearImage}
                  className="flex-1 py-2 px-3 rounded-lg border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors"
                >
                  Analyze Another Food
                </button>
                <button
                  onClick={onViewHistory}
                  className="py-2 px-3 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors flex items-center space-x-1"
                >
                  <span>History</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* Empty State for Results */
            <div className="bg-white rounded-2xl p-8 border border-stone-200 text-center text-stone-400 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-stone-100 text-stone-300 flex items-center justify-center mx-auto">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-stone-700">Awaiting Food Sample</h3>
              <p className="text-xs text-stone-500 max-w-xs mx-auto">
                Upload a photo or select a benchmark sample food on the left, then click <em>“Run Freshness Assessment”</em>.
              </p>
              <div className="pt-4 border-t border-stone-100 text-[11px] text-stone-400 space-y-1">
                <div>✓ Multi-class Freshness (Fresh / Aging / Spoiled)</div>
                <div>✓ Calibrated Softmax Confidence</div>
                <div>✓ Defect Indicators (Mold, Spots, Shriveling)</div>
                <div>✓ Automatic SQLite Logging & CSV Ready</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
