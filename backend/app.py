"""
T238 – AI-Based Food Quality & Freshness Assessment
FastAPI Production Backend Server
"""

import os
import io
import csv
import json
import sqlite3
import datetime
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from PIL import Image

from model import ModelInferenceService, FRESHNESS_CLASSES, SUPPORTED_CATEGORIES

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "food_assessments.db")
WEIGHTS_PATH = os.path.join(BASE_DIR, "weights", "best_freshness_model.pth")

# Initialize Database
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
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
            cv_metrics TEXT
        )
    """)
    conn.commit()
    conn.close()

# Initialize Model Service
inference_service = ModelInferenceService(
    weights_path=WEIGHTS_PATH if os.path.exists(WEIGHTS_PATH) else None,
    model_name="MobileNetV2 / ResNet-18 Freshness Classifier"
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(
    title="T238 Food Quality & Freshness Assessment API",
    description="Computer Vision & Deep Learning API for Food Freshness Classification",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Response Models
class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: str
    database_connected: bool

class ModelStatusResponse(BaseModel):
    model_name: str
    model_version: str
    status: str
    weights_loaded: bool
    freshness_classes: List[str]
    supported_food_categories: List[str]
    input_resolution: str
    confidence_threshold_default: float

class AnalysisResponse(BaseModel):
    id: str
    timestamp: str
    food_category: str
    freshness_classification: str
    confidence_score: float
    is_low_confidence: bool
    confidence_threshold_applied: float
    visible_warning_indicators: List[str]
    explanation: str
    model_name: str
    model_version: str
    cv_metrics: Optional[dict] = None
    food_safety_disclaimer: str

# 1. GET /health
@app.get("/health", response_model=HealthResponse)
def get_health():
    db_ok = os.path.exists(DB_PATH)
    return {
        "status": "ok",
        "service": "T238 – AI-Based Food Quality & Freshness Assessment Backend",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "database_connected": db_ok,
    }

# 2. GET /model/status
@app.get("/model/status", response_model=ModelStatusResponse)
def get_model_status():
    status = "ready" if inference_service.is_weights_loaded else "opencv_heuristic_fallback_no_weights"
    return {
        "model_name": inference_service.model_name,
        "model_version": inference_service.model_version,
        "status": status,
        "weights_loaded": inference_service.is_weights_loaded,
        "freshness_classes": FRESHNESS_CLASSES,
        "supported_food_categories": SUPPORTED_CATEGORIES,
        "input_resolution": "224x224x3",
        "confidence_threshold_default": 70.0,
    }

# 3. POST /analyze
@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_food_image(
    file: UploadFile = File(...),
    confidence_threshold: float = Form(70.0)
):
    # Validate file format
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {file.content_type}. Please upload JPG, PNG, or WEBP."
        )

    # Read bytes
    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(contents) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size exceeds 12MB limit.")

    try:
        pil_image = Image.open(io.BytesIO(contents))
        pil_image.verify()
        # Re-open after verify
        pil_image = Image.open(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid or corrupted image file: {str(e)}")

    # Run inference
    prediction = inference_service.predict(pil_image, confidence_threshold=confidence_threshold)

    # Generate record ID
    timestamp_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record_id = "FA-PY-" + datetime.datetime.now().strftime("%Y%m%d%H%M%S") + "-" + os.urandom(2).hex().upper()

    # Save to SQLite
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO analyses (
                id, timestamp, food_category, freshness_classification,
                confidence_score, visible_indicators, explanation,
                model_name, model_version, cv_metrics
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            record_id,
            timestamp_str,
            prediction["food_category"],
            prediction["freshness_classification"],
            prediction["confidence_score"],
            json.dumps(prediction["visible_warning_indicators"]),
            prediction["explanation"],
            prediction["model_name"],
            prediction["model_version"],
            json.dumps(prediction.get("cv_metrics", {}))
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        # Log DB error but return prediction
        print(f"Database write error: {e}")

    return {
        "id": record_id,
        "timestamp": timestamp_str,
        "food_category": prediction["food_category"],
        "freshness_classification": prediction["freshness_classification"],
        "confidence_score": prediction["confidence_score"],
        "is_low_confidence": prediction["is_low_confidence"],
        "confidence_threshold_applied": confidence_threshold,
        "visible_warning_indicators": prediction["visible_warning_indicators"],
        "explanation": prediction["explanation"],
        "model_name": prediction["model_name"],
        "model_version": prediction["model_version"],
        "cv_metrics": prediction.get("cv_metrics"),
        "food_safety_disclaimer": "This assessment evaluates visible freshness indicators only. It cannot detect internal pathogens, bacterial toxins, or chemical contamination. Always verify freshness before consumption."
    }

# 4. GET /history
@app.get("/history")
def get_analysis_history(limit: int = Query(100, ge=1, le=500)):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, timestamp, food_category, freshness_classification,
               confidence_score, visible_indicators, explanation,
               model_name, model_version, cv_metrics
        FROM analyses
        ORDER BY timestamp DESC
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()

    records = []
    for r in rows:
        records.append({
            "id": r["id"],
            "timestamp": r["timestamp"],
            "food_category": r["food_category"],
            "freshness_classification": r["freshness_classification"],
            "confidence_score": r["confidence_score"],
            "visible_indicators": json.loads(r["visible_indicators"] or "[]"),
            "explanation": r["explanation"],
            "model_name": r["model_name"],
            "model_version": r["model_version"],
            "cv_metrics": json.loads(r["cv_metrics"] or "{}") if r["cv_metrics"] else None,
        })

    return {"total": len(records), "records": records}

# 5. GET /history/{id}
@app.get("/history/{record_id}")
def get_analysis_detail(record_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM analyses WHERE id = ?", (record_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail=f"Analysis with ID {record_id} not found.")

    return {
        "id": row["id"],
        "timestamp": row["timestamp"],
        "food_category": row["food_category"],
        "freshness_classification": row["freshness_classification"],
        "confidence_score": row["confidence_score"],
        "visible_indicators": json.loads(row["visible_indicators"] or "[]"),
        "explanation": row["explanation"],
        "model_name": row["model_name"],
        "model_version": row["model_version"],
        "cv_metrics": json.loads(row["cv_metrics"] or "{}") if row["cv_metrics"] else None
    }

# 6. DELETE /history
@app.delete("/history")
def clear_history():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM analyses")
    deleted_count = cursor.rowcount
    conn.commit()
    conn.close()

    return {"message": "Analysis history cleared successfully", "deleted_count": deleted_count}

# 7. GET /export/csv
@app.get("/export/csv")
def export_csv():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, timestamp, food_category, freshness_classification,
               confidence_score, visible_indicators, model_name, model_version
        FROM analyses
        ORDER BY timestamp DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    # Add UTF-8 BOM for Microsoft Excel compatibility
    output.write("\ufeff")
    writer = csv.writer(output, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    
    # Required columns:
    # Analysis ID, Timestamp, Food Category, Freshness Classification, Confidence (%), Visible Warning Indicators, Model Name, Model Version
    writer.writerow([
        "Analysis ID",
        "Timestamp",
        "Food Category",
        "Freshness Classification",
        "Confidence (%)",
        "Visible Warning Indicators",
        "Model Name",
        "Model Version"
    ])

    for r in rows:
        try:
            indicators_list = json.loads(r["visible_indicators"] or "[]")
        except Exception:
            indicators_list = []
        indicators = "; ".join(indicators_list) if indicators_list else "None"
        try:
            conf_str = f"{float(r['confidence_score']):.1f}"
        except Exception:
            conf_str = "0.0"

        writer.writerow([
            r["id"],
            r["timestamp"],
            r["food_category"] or "Unknown",
            r["freshness_classification"],
            conf_str,
            indicators,
            r["model_name"],
            r["model_version"]
        ])

    output.seek(0)
    filename = f"food_freshness_export_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
