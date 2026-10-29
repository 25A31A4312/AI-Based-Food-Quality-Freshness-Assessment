"""
T238 – AI-Based Food Quality & Freshness Assessment
PyTorch Model Architecture & OpenCV Computer Vision Feature Extractor
"""

import os
import logging
from typing import Dict, List, Tuple, Any, Optional
import numpy as np
from PIL import Image

# PyTorch & Torchvision
import torch
import torch.nn as nn
from torchvision import models, transforms

# OpenCV
import cv2

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FoodFreshnessModel")

# Canonical Class Order (Index 0 = Fresh, Index 1 = Aging, Index 2 = Visibly Spoiled)
FRESHNESS_CLASSES = ["Fresh", "Aging", "Visibly Spoiled"]
FRESHNESS_CLASS_TO_IDX = {cls_name: idx for idx, cls_name in enumerate(FRESHNESS_CLASSES)}

SUPPORTED_CATEGORIES = [
    "Apple",
    "Banana",
    "Tomato",
    "Potato",
    "Orange",
    "Strawberry",
    "Bell Pepper",
    "Carrot",
]


class FoodFreshnessResNet18(nn.Module):
    """
    ResNet-18 Multi-Task Architecture:
    - Head 1: Freshness Classification (Fresh, Aging, Visibly Spoiled)
    - Head 2: Food Category Recognition (Apple, Banana, Tomato, etc.)
    """
    def __init__(self, num_freshness_classes: int = 3, num_category_classes: int = 8, pretrained: bool = True):
        super(FoodFreshnessResNet18, self).__init__()
        weights = models.ResNet18_Weights.DEFAULT if pretrained else None
        backbone = models.resnet18(weights=weights)

        in_features = backbone.fc.in_features
        backbone.fc = nn.Identity()
        self.backbone = backbone

        self.freshness_head = nn.Sequential(
            nn.Dropout(p=0.3),
            nn.Linear(in_features, 128),
            nn.ReLU(),
            nn.Linear(128, num_freshness_classes),
        )

        self.category_head = nn.Sequential(
            nn.Dropout(p=0.3),
            nn.Linear(in_features, 128),
            nn.ReLU(),
            nn.Linear(128, num_category_classes),
        )

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        features = self.backbone(x)
        freshness_logits = self.freshness_head(features)
        category_logits = self.category_head(features)
        return freshness_logits, category_logits


class FoodFreshnessMobileNetV2(nn.Module):
    """
    MobileNetV2 Lightweight Architecture for Edge Deployment.
    """
    def __init__(self, num_freshness_classes: int = 3, num_category_classes: int = 8, pretrained: bool = True):
        super(FoodFreshnessMobileNetV2, self).__init__()
        weights = models.MobileNet_V2_Weights.DEFAULT if pretrained else None
        backbone = models.mobilenet_v2(weights=weights)

        in_features = backbone.classifier[1].in_features
        backbone.classifier = nn.Identity()
        self.backbone = backbone

        self.freshness_head = nn.Sequential(
            nn.Dropout(p=0.2),
            nn.Linear(in_features, 128),
            nn.ReLU(),
            nn.Linear(128, num_freshness_classes),
        )

        self.category_head = nn.Sequential(
            nn.Dropout(p=0.2),
            nn.Linear(in_features, 128),
            nn.ReLU(),
            nn.Linear(128, num_category_classes),
        )

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        features = self.backbone(x)
        freshness_logits = self.freshness_head(features)
        category_logits = self.category_head(features)
        return freshness_logits, category_logits


class OpenCVFeatureExtractor:
    """
    Foreground-segmented Computer Vision defect & color-geometry analysis:
    - Separates produce foreground from neutral studio backgrounds and drop shadows
    - Computes localized dark spots vs smooth shading
    - Evaluates browning relative to the produce item's natural hue/luminance
    - Separates fungal mold/mycelium from glossy specular reflections
    """
    @staticmethod
    def analyze_image_cv(image_bgr: np.ndarray) -> Dict[str, Any]:
        resized = cv2.resize(image_bgr, (224, 224), interpolation=cv2.INTER_AREA)
        h, w, _ = resized.shape
        total_pixels = h * w

        hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)  # H: 0..179, S: 0..255, V: 0..255
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY).astype(np.float32)

        # Estimate border background color from 4px perimeter
        top = resized[:4, :, :].reshape(-1, 3)
        bottom = resized[-4:, :, :].reshape(-1, 3)
        left = resized[:, :4, :].reshape(-1, 3)
        right = resized[:, -4:, :].reshape(-1, 3)
        border_pixels = np.concatenate([top, bottom, left, right], axis=0)
        bg_bgr = np.median(border_pixels, axis=0)

        diff = np.linalg.norm(resized.astype(np.float32) - bg_bgr.astype(np.float32), axis=2)
        sat = hsv[:, :, 1].astype(np.float32) / 255.0
        val = hsv[:, :, 2].astype(np.float32) / 255.0
        hue_deg = hsv[:, :, 0].astype(np.float32) * 2.0  # 0..360

        is_white_bg = (val > 0.92) & (sat < 0.10)
        is_drop_shadow = (sat < 0.12) & (val >= 0.52) & (val <= 0.94) & (diff < 105.0)
        fg_mask = (diff >= 36.0) & (~is_white_bg) & (~is_drop_shadow)

        if np.count_nonzero(fg_mask) < total_pixels * 0.04:
            # Close-up crop where food fills the border
            fg_mask = (sat > 0.22) & (val > 0.12) & (val < 0.94)

        fg_count = int(np.count_nonzero(fg_mask))
        if fg_count < int(total_pixels * 0.03):
            return {
                "estimated_category": "Unknown or unsupported category",
                "browning_percent": 0.0,
                "dark_spot_percent": 0.0,
                "surface_roughness_score": 0.0,
                "mold_indicator_ratio": 0.0,
                "visible_indicators": [],
                "heuristic_freshness": "Fresh",
                "heuristic_confidence": 52.0,
            }

        # Estimate dominant produce category from foreground color & geometry
        ys, xs = np.where(fg_mask)
        fg_w = max(1, int(xs.max() - xs.min() + 1))
        fg_h = max(1, int(ys.max() - ys.min() + 1))
        elongation = max(fg_w / fg_h, fg_h / fg_w)
        box_fill = fg_count / max(1, fg_w * fg_h)

        # Erode foreground mask by 2-3px so silhouette edges & stems do not pollute skin defects
        ksize = 5 if (min(fg_w, fg_h) < 85 or box_fill < 0.55) else 7
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
        skin_mask_u8 = cv2.erode(fg_mask.astype(np.uint8) * 255, kernel, iterations=1)
        skin_mask = skin_mask_u8 > 0
        if np.count_nonzero(skin_mask) < 100:
            skin_mask = fg_mask
        skin_count = int(np.count_nonzero(skin_mask))
        median_skin_lum = float(np.median(gray[skin_mask]))

        red_ratio = float(np.count_nonzero(fg_mask & ((hue_deg >= 342) | (hue_deg <= 16)) & (sat > 0.35) & (val > 0.20))) / fg_count
        orange_ratio = float(np.count_nonzero(fg_mask & (hue_deg >= 16) & (hue_deg <= 37) & (sat > 0.58) & (val > 0.42))) / fg_count
        yellow_ratio = float(np.count_nonzero(fg_mask & (hue_deg >= 38) & (hue_deg <= 68) & (sat > 0.32) & (val > 0.38))) / fg_count
        green_ratio = float(np.count_nonzero(fg_mask & (hue_deg >= 69) & (hue_deg <= 162) & (sat > 0.22) & (val > 0.16))) / fg_count
        earthen_ratio = float(np.count_nonzero(fg_mask & (hue_deg >= 18) & (hue_deg <= 46) & (val >= 0.22) & (val <= 0.85) & ((sat <= 0.72) | (gray < 142.0)))) / fg_count

        estimated_category = "Unknown or unsupported category"
        if yellow_ratio >= 0.24 and (elongation >= 1.35 or box_fill < 0.62):
            estimated_category = "Banana"
        elif elongation >= 1.24 and elongation <= 1.82 and earthen_ratio >= 0.30 and red_ratio < 0.15 and green_ratio < 0.12 and yellow_ratio < 0.25 and median_skin_lum < 145.0:
            estimated_category = "Potato"
        elif orange_ratio >= 0.25:
            estimated_category = "Carrot" if elongation >= 1.85 else "Orange"
        elif green_ratio >= 0.35 and red_ratio < 0.12:
            if box_fill >= 0.76 and elongation <= 1.48:
                estimated_category = "Bell Pepper"
            elif elongation <= 1.38:
                estimated_category = "Apple"
        elif red_ratio >= 0.25:
            if box_fill >= 0.80 and elongation <= 1.48:
                estimated_category = "Bell Pepper"
            elif green_ratio >= 0.04 and elongation > 1.15 and elongation <= 1.65 and fg_h > fg_w:
                estimated_category = "Strawberry"
            elif fg_w / fg_h >= 1.06:
                estimated_category = "Tomato"
            elif green_ratio >= 0.015:
                estimated_category = "Apple"
            else:
                estimated_category = "Tomato"
        elif earthen_ratio >= 0.35 and red_ratio < 0.15 and green_ratio < 0.15:
            estimated_category = "Potato"

        local_mean = cv2.blur(gray, (17, 17))

        # 1. Localized Dark Spots vs medium-brown aging freckles & smooth shading
        deep_black = (gray < 32.0) & (val < 0.19)
        localized_dark = (
            (gray < 52.0)
            & (val < 0.30)
            & (gray < local_mean * 0.65)
            & ((local_mean - gray) > 24.0)
            & (gray < median_skin_lum * 0.58)
        )
        dark_spot_pixels = int(np.count_nonzero(skin_mask & (deep_black | localized_dark)))
        dark_spot_ratio = (dark_spot_pixels / skin_count) * 100.0

        # 2. Browning / Necrosis relative to natural skin hue
        is_orange_or_tan = estimated_category in ("Orange", "Carrot", "Potato") or orange_ratio >= 0.28
        if is_orange_or_tan:
            brown_cond = (
                (hue_deg >= 10)
                & (hue_deg <= 45)
                & (sat >= 0.18)
                & (val < 0.42)
                & (gray < median_skin_lum * 0.62)
            )
        else:
            brown_cond = (
                (hue_deg >= 14)
                & (hue_deg <= 42)
                & (sat >= 0.24)
                & (sat <= 0.95)
                & (gray >= 25.0)
                & (gray <= 135.0)
                & (gray < median_skin_lum * 0.82)
            ) | (((hue_deg >= 345) | (hue_deg <= 14)) & (val < 0.26) & (gray < median_skin_lum * 0.52))

        browning_pixels = int(np.count_nonzero(skin_mask & brown_cond))
        browning_ratio = (browning_pixels / skin_count) * 100.0

        # 3. Mold-like mycelium (Teal Penicillium + fuzzy spores near rot, excluding clean glossy glare)
        is_green_item = green_ratio >= 0.35
        teal_mold = (~is_green_item) & (hue_deg >= 148) & (hue_deg <= 208) & (sat >= 0.20) & (val >= 0.20) & (val <= 0.78)
        rot_or_teal = ((gray < 46.0) | teal_mold).astype(np.uint8)
        nearby_rot = cv2.dilate(rot_or_teal, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))) > 0
        fuzzy_mold = (sat < 0.28) & (val >= 0.52) & (val <= 0.97) & nearby_rot

        mold_pixels = int(np.count_nonzero(skin_mask & (teal_mold | fuzzy_mold)))
        mold_ratio = (mold_pixels / skin_count) * 100.0

        # 4. Surface Roughness inside skin mask
        gx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
        gy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
        mean_grad = float(np.mean((gx[skin_mask] + gy[skin_mask]) * 0.5))
        roughness_score = min(10.0, (mean_grad / 18.0) * 10.0)

        visible_indicators: List[str] = []
        if browning_ratio >= 3.2 or (dark_spot_ratio >= 8.0 and browning_ratio >= 1.5):
            visible_indicators.append("Discoloration")
        if dark_spot_ratio >= 2.2:
            visible_indicators.append("Dark spots")
        if roughness_score >= 3.4:
            visible_indicators.append("Wrinkles or shriveling")
        if mold_ratio >= 1.0 or (mold_pixels >= 16 and dark_spot_ratio >= 5.0):
            visible_indicators.append("Mold-like patterns")
        if browning_ratio >= 16.0 or dark_spot_ratio >= 11.0 or (mold_ratio >= 4.0 and (dark_spot_ratio >= 3.0 or browning_ratio >= 4.0)):
            visible_indicators.append("Surface breakdown")

        # Calibrated 3-class softmax scoring
        defect_severity = (
            mold_ratio * 4.2
            + dark_spot_ratio * 1.6
            + browning_ratio * 1.25
            + max(0.0, roughness_score - 1.8) * 3.0
        )
        logit_fresh = 2.55 - mean_grad * 0.05 - defect_severity * 0.26
        logit_aging = -0.4 + min(2.4, defect_severity * 0.22) - max(0.0, defect_severity - 14.0) * 0.20
        logit_spoiled = -2.8 + defect_severity * 0.21

        if mold_ratio >= 2.2 or (mold_pixels >= 16 and dark_spot_ratio >= 8.0) or dark_spot_ratio >= 12.0 or browning_ratio >= 20.0:
            logit_spoiled += 1.8
            logit_fresh -= 2.0
        elif mold_ratio < 1.2 and (dark_spot_ratio >= 2.2 or browning_ratio >= 3.2 or roughness_score >= 3.4):
            logit_aging += 1.3

        logits = np.array([logit_fresh, logit_aging, logit_spoiled], dtype=np.float64)
        exp_l = np.exp(logits - np.max(logits))
        probs = exp_l / np.sum(exp_l)
        best_idx = int(np.argmax(probs))
        heuristic_freshness = FRESHNESS_CLASSES[best_idx]
        heuristic_conf = float(min(98.5, max(38.0, probs[best_idx] * 100.0)))

        if heuristic_freshness == "Fresh":
            visible_indicators = [
                ind for ind in visible_indicators
                if ind not in ("Mold-like patterns", "Surface breakdown")
            ]

        return {
            "estimated_category": estimated_category,
            "browning_percent": round(browning_ratio, 2),
            "dark_spot_percent": round(dark_spot_ratio, 2),
            "surface_roughness_score": round(roughness_score, 2),
            "mold_indicator_ratio": round(mold_ratio, 2),
            "visible_indicators": visible_indicators,
            "heuristic_freshness": heuristic_freshness,
            "heuristic_confidence": round(heuristic_conf, 1),
        }


class ModelInferenceService:
    """
    Manages PyTorch model loading, image transforms, inference, and postprocessing.
    NOTE: If fine-tuned checkpoint weights (`best_freshness_model.pth`) are not present on disk,
    random untrained linear classification heads are NOT used to fabricate neural predictions;
    instead, foreground-segmented OpenCV defect heuristics are used and transparently reported.
    """
    def __init__(self, weights_path: Optional[str] = None, model_name: str = "ResNet-18"):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model_name = model_name
        self.model_version = "1.1.0"
        self.weights_path = weights_path
        self.is_weights_loaded = False

        # Preprocessing transforms matching val/test evaluation pipeline
        self.transform = transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])

        if "mobilenet" in model_name.lower():
            self.model = FoodFreshnessMobileNetV2(
                num_freshness_classes=len(FRESHNESS_CLASSES),
                num_category_classes=len(SUPPORTED_CATEGORIES),
                pretrained=False,
            )
        else:
            self.model = FoodFreshnessResNet18(
                num_freshness_classes=len(FRESHNESS_CLASSES),
                num_category_classes=len(SUPPORTED_CATEGORIES),
                pretrained=False,
            )

        self.model.to(self.device)
        self.model.eval()

        if weights_path and os.path.isfile(weights_path):
            try:
                state_dict = torch.load(weights_path, map_location=self.device)
                self.model.load_state_dict(state_dict)
                self.is_weights_loaded = True
                logger.info(f"Loaded fine-tuned model weights from {weights_path}")
            except Exception as e:
                logger.warning(f"Could not load weights from {weights_path}: {e}")
                self.is_weights_loaded = False
        else:
            logger.info(
                "No fine-tuned checkpoint found at weights_path; OpenCV optical heuristic fallback active."
            )

    def predict(self, pil_image: Image.Image, confidence_threshold: float = 70.0) -> Dict[str, Any]:
        if pil_image.mode in ("RGBA", "LA") or (pil_image.mode == "P" and "transparency" in pil_image.info):
            bg = Image.new("RGB", pil_image.size, (248, 250, 252))
            rgba = pil_image.convert("RGBA")
            bg.paste(rgba, mask=rgba.split()[3])
            pil_image = bg
        elif pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")

        np_image = np.array(pil_image)
        bgr_image = cv2.cvtColor(np_image, cv2.COLOR_RGB2BGR)
        cv_features = OpenCVFeatureExtractor.analyze_image_cv(bgr_image)

        visible_signs = list(cv_features["visible_indicators"])
        pred_category = cv_features["estimated_category"]

        if self.is_weights_loaded:
            input_tensor = self.transform(pil_image).unsqueeze(0).to(self.device)
            with torch.no_grad():
                freshness_logits, _ = self.model(input_tensor)
                freshness_probs = torch.softmax(freshness_logits, dim=1)[0].cpu().numpy()

            freshness_idx = int(np.argmax(freshness_probs))
            pred_freshness = FRESHNESS_CLASSES[freshness_idx]
            freshness_confidence = float(freshness_probs[freshness_idx] * 100.0)
            active_model_name = self.model_name
        else:
            # Fine-tuned CNN weights are unavailable; do NOT use random untrained linear heads
            pred_freshness = cv_features["heuristic_freshness"]
            freshness_confidence = float(cv_features["heuristic_confidence"])
            active_model_name = "OpenCV-Optical-Heuristic (No Fine-Tuned CNN Checkpoint)"

        if pred_freshness == "Fresh":
            visible_signs = [
                s for s in visible_signs if s not in ("Mold-like patterns", "Surface breakdown")
            ]

        explanation_parts = []
        if pred_freshness == "Fresh":
            explanation_parts.append(
                f"Surface shows intact dermal coloration ({cv_features['browning_percent']}% browning, {cv_features['dark_spot_percent']}% dark spots)."
            )
        elif pred_freshness == "Aging":
            explanation_parts.append(
                f"Moderate senescence observed ({cv_features['browning_percent']}% discoloration, {cv_features['dark_spot_percent']}% dark spots, roughness {cv_features['surface_roughness_score']}/10)."
            )
        else:
            explanation_parts.append(
                f"Visible spoilage detected ({cv_features['mold_indicator_ratio']}% mold-like patterns, {cv_features['dark_spot_percent']}% dark spots, {cv_features['browning_percent']}% browning)."
            )

        if visible_signs:
            explanation_parts.append(f"Identified visible indicators: {', '.join(visible_signs)}.")
        else:
            explanation_parts.append("No prominent surface defect patterns detected.")

        if not self.is_weights_loaded:
            explanation_parts.append(
                "Note: Evaluated using OpenCV surface heuristics because fine-tuned PyTorch weights (weights/best_freshness_model.pth) are not yet trained."
            )

        explanation = " ".join(explanation_parts)
        is_low_confidence = (
            freshness_confidence < confidence_threshold
            or pred_category == "Unknown or unsupported category"
        )

        return {
            "food_category": pred_category,
            "freshness_classification": pred_freshness,
            "confidence_score": round(freshness_confidence, 1),
            "is_low_confidence": is_low_confidence,
            "visible_warning_indicators": visible_signs,
            "explanation": explanation,
            "cv_metrics": {
                "browning_percent": cv_features["browning_percent"],
                "dark_spot_percent": cv_features["dark_spot_percent"],
                "surface_roughness_score": cv_features["surface_roughness_score"],
                "mold_indicator_ratio": cv_features["mold_indicator_ratio"],
            },
            "model_name": active_model_name,
            "model_version": self.model_version,
            "weights_loaded": self.is_weights_loaded,
        }
