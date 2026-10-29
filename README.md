# T238 – AI-Based Food Quality & Freshness Assessment

An AI-powered Computer Vision and Deep Learning system designed to analyze food images and classify their visible freshness condition into three distinct categories:
- **Fresh** (firm, uniform vibrant pigmentation, intact cellular boundary)
- **Aging** (early senescence, minor shriveling/wrinkles, mild discoloration)
- **Visibly Spoiled** (active mold/mycelium, black necrosis, soft rot, surface breakdown)

The system detects food categories (Apples, Bananas, Tomatoes, Potatoes, Oranges, Strawberries, Bell Peppers, Carrots, etc.), calculates calibrated confidence scores with warning thresholds, extracts surface computer vision metrics (browning index, dark spot ratio, surface roughness), logs history to SQLite, and exports real records to CSV.

---

## Architecture Overview

```
+-------------------------------------------------------------------------+
|                React + TypeScript + Tailwind CSS Frontend               |
|   (Overview, Analyze Food, Analysis History, Reports & CSV, Model Status)|
+-------------------------------------------------------------------------+
                                    |
          +-------------------------+-------------------------+
          |                                                   |
          v                                                   v
+-----------------------------+           +-----------------------------+
|    AI Studio Full-Stack     |           |    Local Python FastAPI     |
|     Express Service (3000)  |           |     Backend Service (8000)  |
|  - SQLite (food_freshness)  |           |  - PyTorch ResNet18/MobileNet|
|  - Gemini 3.8 Flash Vision  |           |  - OpenCV Feature Extractor |
|  - Computer Vision Metrics  |           |  - SQLite Database          |
|  - REST Endpoints & CSV     |           |  - PyTest Automated Tests   |
+-----------------------------+           +-----------------------------+
```

---

## Features

1. **Food Image Upload & Validation**:
   - Supports JPG, JPEG, PNG, WEBP up to 12MB.
   - Drag-and-drop zone with instant preview, replace/remove controls.
   - Built-in quick test sample image gallery for immediate testing.
   - Configurable confidence threshold (50% – 95%).

2. **Food Category Detection**:
   - Accurately classifies supported food categories or outputs "Unknown or unsupported category" when confidence is insufficient.

3. **Freshness Classification**:
   - Real model inference (Fresh, Aging, Visibly Spoiled).
   - Calibrated confidence percentages.
   - Warning banner when confidence falls below the user threshold: *"Uncertain prediction — further inspection required"*.

4. **Surface Computer Vision Defect Indicators**:
   - Discoloration
   - Dark spots
   - Wrinkles or shriveling
   - Mold-like patterns
   - Surface breakdown

5. **Analysis History & SQLite Persistence**:
   - Real persistence of all performed assessments with timestamps and defect metrics.
   - Detail inspection modal.
   - Clear history with confirmation.

6. **CSV Export**:
   - Live download containing: `Analysis ID`, `Timestamp`, `Food Category`, `Freshness Classification`, `Confidence Score`, `Visible Warning Indicators`, `Model Name`, `Model Version`.

7. **Food Safety Disclaimer**:
   - Transparently communicates that computer vision evaluates visible surface traits only and does not detect internal toxins or bacterial pathogens.

---

## Running the Application

### 1. In Google AI Studio
The app is immediately live and functional! The full-stack Express server on port 3000 hosts the Vite frontend, the SQLite database, and the multimodal vision inference engine.

### 2. Running the Python FastAPI Backend Locally (Optional / Demonstration)
To run the companion PyTorch + OpenCV backend on your local machine:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python dataset.py --generate-samples
python train.py --epochs 10
uvicorn app:app --port 8000 --reload
```
In the frontend dashboard, you can switch the engine selector to **"Local Python FastAPI"** to test local model inference directly!
