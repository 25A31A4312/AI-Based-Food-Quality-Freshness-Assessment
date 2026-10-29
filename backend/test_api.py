"""
T238 – AI-Based Food Quality & Freshness Assessment
Automated Pytest Suite for Backend Endpoints, Validation, Inference, History & CSV Export
"""

import io
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import app, init_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def run_around_tests():
    init_db()
    yield

def create_test_image(color=(34, 197, 94), format="JPEG"):
    """Helper to generate in-memory test image bytes"""
    img = Image.new("RGB", (100, 100), color=color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    buf.seek(0)
    return buf

# 1. Health Endpoint Test
def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "service" in data
    assert data["database_connected"] is True

# 2. Model Status Endpoint Test
def test_model_status_endpoint():
    response = client.get("/model/status")
    assert response.status_code == 200
    data = response.json()
    assert "model_name" in data
    assert "freshness_classes" in data
    assert len(data["freshness_classes"]) == 3
    assert "Fresh" in data["freshness_classes"]
    assert "Aging" in data["freshness_classes"]
    assert "Visibly Spoiled" in data["freshness_classes"]

# 3. Analyze Endpoint with Valid JPEG
def test_analyze_valid_image():
    img_buf = create_test_image(color=(34, 197, 94), format="JPEG")
    files = {"file": ("apple.jpg", img_buf, "image/jpeg")}
    response = client.post("/analyze", files=files, data={"confidence_threshold": "70"})
    
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["freshness_classification"] in ["Fresh", "Aging", "Visibly Spoiled"]
    assert "confidence_score" in data
    assert "food_safety_disclaimer" in data
    assert isinstance(data["visible_warning_indicators"], list)

# 4. Analyze Endpoint with Unsupported File Format
def test_analyze_invalid_file_format():
    fake_txt = io.BytesIO(b"Not an image file")
    files = {"file": ("test.txt", fake_txt, "text/plain")}
    response = client.post("/analyze", files=files)
    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]

# 5. Analyze Endpoint with Corrupted Image
def test_analyze_corrupt_image():
    corrupt_buf = io.BytesIO(b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00corrupt_bytes_here")
    files = {"file": ("corrupt.jpg", corrupt_buf, "image/jpeg")}
    response = client.post("/analyze", files=files)
    assert response.status_code == 400
    assert "Invalid or corrupted image" in response.json()["detail"]

# 6. History Retrieval & Persistence Test
def test_history_flow():
    # Submit one analysis
    img_buf = create_test_image()
    files = {"file": ("banana.jpg", img_buf, "image/jpeg")}
    res_post = client.post("/analyze", files=files)
    assert res_post.status_code == 200
    record_id = res_post.json()["id"]

    # Fetch history
    res_hist = client.get("/history")
    assert res_hist.status_code == 200
    hist_data = res_hist.json()
    assert hist_data["total"] >= 1
    found = any(r["id"] == record_id for r in hist_data["records"])
    assert found is True

    # Fetch specific record by ID
    res_detail = client.get(f"/history/{record_id}")
    assert res_detail.status_code == 200
    assert res_detail.json()["id"] == record_id

# 7. CSV Export Test
def test_csv_export():
    response = client.get("/export/csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    content = response.text
    # Verify header line columns
    assert "Analysis ID" in content
    assert "Timestamp" in content
    assert "Food Category" in content
    assert "Freshness Classification" in content
    assert "Confidence (%)" in content
    assert "Visible Warning Indicators" in content
    assert "Model Name" in content
    assert "Model Version" in content

# 8. Delete History Test
def test_clear_history():
    response = client.delete("/history")
    assert response.status_code == 200
    assert "deleted_count" in response.json()

    # Verify history is now empty
    res_hist = client.get("/history")
    assert res_hist.json()["total"] == 0
