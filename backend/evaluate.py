"""
T238 – AI-Based Food Quality & Freshness Assessment
Model Evaluation Script: Computes Class-wise Precision, Recall, F1-Score, and Confusion Matrix
"""

import os
import argparse
import numpy as np
import torch
from torchvision import datasets, transforms
from torch.utils.data import DataLoader
from sklearn.metrics import classification_report, confusion_matrix

from model import FoodFreshnessResNet18, FoodFreshnessMobileNetV2, FRESHNESS_CLASSES, SUPPORTED_CATEGORIES

def evaluate(dataset_dir: str, weights_path: str, model_type: str = "resnet18", batch_size: int = 32):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Running evaluation on {device}...")

    test_path = os.path.join(dataset_dir, "test")
    if not os.path.exists(test_path):
        print(f"[!] Test split not found at {test_path}. Provide a valid dataset directory with a 'test' subfolder.")
        return

    test_transform = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    test_dataset = datasets.ImageFolder(test_path, transform=test_transform)
    test_idx_map = {
        folder_idx: FRESHNESS_CLASSES.index(cls_name)
        for cls_name, folder_idx in test_dataset.class_to_idx.items()
        if cls_name in FRESHNESS_CLASSES
    }
    test_dataset.target_transform = lambda y: test_idx_map[y]
    test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False)

    print(f"[*] Loaded {len(test_dataset)} test samples across {len(test_dataset.classes)} classes.")

    if model_type == "mobilenetv2":
        model = FoodFreshnessMobileNetV2(
            num_freshness_classes=len(FRESHNESS_CLASSES),
            num_category_classes=len(SUPPORTED_CATEGORIES),
            pretrained=False
        )
    else:
        model = FoodFreshnessResNet18(
            num_freshness_classes=len(FRESHNESS_CLASSES),
            num_category_classes=len(SUPPORTED_CATEGORIES),
            pretrained=False
        )

    if os.path.exists(weights_path):
        state_dict = torch.load(weights_path, map_location=device)
        model.load_state_dict(state_dict)
        print(f"[+] Loaded weights from {weights_path}")
    else:
        print(f"[!] Warning: weights file {weights_path} not found. Running with uncalibrated weights.")

    model.to(device)
    model.eval()

    y_true = []
    y_pred = []

    with torch.no_grad():
        for images, labels in test_loader:
            images = images.to(device)
            freshness_logits, _ = model(images)
            preds = torch.argmax(freshness_logits, dim=1).cpu().numpy()
            y_pred.extend(preds)
            y_true.extend(labels.numpy())

    y_true = np.array(y_true)
    y_pred = np.array(y_pred)

    print("\n================ CLASSIFICATION REPORT ================")
    report = classification_report(
        y_true, y_pred,
        target_names=FRESHNESS_CLASSES[:len(np.unique(y_true))],
        digits=4
    )
    print(report)

    print("================ CONFUSION MATRIX ================")
    cm = confusion_matrix(y_true, y_pred)
    print("Classes:", FRESHNESS_CLASSES)
    print(cm)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", type=str, default="./dataset")
    parser.add_argument("--weights", type=str, default="./weights/best_freshness_model.pth")
    parser.add_argument("--model", type=str, default="resnet18")
    args = parser.parse_args()

    evaluate(args.dataset_dir, args.weights, args.model)
