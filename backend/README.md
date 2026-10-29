# T238 – AI-Based Food Quality & Freshness Assessment (Backend)

This is the standalone Python FastAPI + PyTorch backend for the **T238 – AI-Based Food Quality & Freshness Assessment** project.

## Technology Stack
- **API Framework**: FastAPI with Pydantic & Uvicorn
- **AI / Deep Learning**: PyTorch with MobileNetV2 / ResNet-18 multi-task architecture
- **Computer Vision**: OpenCV (HSV color segmentation, necrosis detection, Laplacian variance)
- **Image Processing**: Pillow & NumPy
- **Database**: SQLite (`food_assessments.db`)
- **Testing**: PyTest with HTTPX TestClient

---

## 1. Local Setup in VS Code / Terminal

### Step A: Create and Activate a Python Virtual Environment
```bash
cd backend
python -m venv venv

# On Linux/macOS:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

### Step B: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step C: Initialize Sample Dataset Structure
```bash
python dataset.py --generate-samples
```
This generates the proper `train/`, `val/`, and `test/` split structure with sample images to verify your training pipeline without data leakage.

---

## 2. Training the PyTorch Freshness Model

To train the MobileNetV2 or ResNet-18 model on your food freshness dataset:

```bash
# Train ResNet-18:
python train.py --dataset-dir ./dataset --model resnet18 --epochs 15 --batch-size 32

# Or train lightweight MobileNetV2:
python train.py --dataset-dir ./dataset --model mobilenetv2 --epochs 15 --batch-size 32
```
The best checkpoint will be automatically saved to `./weights/best_freshness_model.pth` along with `model_metadata.json`.

---

## 3. Evaluating on Held-Out Test Data

To compute class-wise Precision, Recall, F1-Score, and the Confusion Matrix:

```bash
python evaluate.py --dataset-dir ./dataset --weights ./weights/best_freshness_model.pth
```

---

## 4. Running the FastAPI Server

Start the backend API server on port 8000:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```
Interactive Swagger API documentation will be available at:
`http://localhost:8000/docs`

---

## 5. Running Automated Backend Tests

Run the test suite with pytest:

```bash
pytest test_api.py -v
```

---

## 6. API Endpoints Specification

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Backend status & database connection |
| `GET` | `/model/status` | Model architecture, version, weights status |
| `POST` | `/analyze` | Accepts food image file + confidence threshold, returns prediction |
| `GET` | `/history` | Retrieves logged inspection records from SQLite |
| `GET` | `/history/{id}` | Retrieves specific inspection record |
| `DELETE` | `/history` | Clears inspection history |
| `GET` | `/export/csv` | Downloads CSV export of real analysis records |
