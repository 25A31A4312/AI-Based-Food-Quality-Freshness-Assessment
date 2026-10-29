"""
T238 – AI-Based Food Quality & Freshness Assessment
Reproducible Model Training Script (PyTorch + MobileNetV2 / ResNet-18)

Usage:
    python train.py --dataset-dir ./dataset --epochs 20 --batch-size 32 --model resnet18
"""

import os
import time
import json
import argparse
import copy
from typing import Dict, Tuple

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from torchvision import datasets, transforms

from model import (
    FoodFreshnessResNet18,
    FoodFreshnessMobileNetV2,
    FRESHNESS_CLASSES,
    SUPPORTED_CATEGORIES
)

def parse_args():
    parser = argparse.ArgumentParser(description="Train Food Freshness & Category Classifier")
    parser.add_argument("--dataset-dir", type=str, default="./dataset", help="Path to dataset root directory")
    parser.add_argument("--model", type=str, default="resnet18", choices=["resnet18", "mobilenetv2"], help="Backbone model")
    parser.add_argument("--epochs", type=int, default=15, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate")
    parser.add_argument("--weight-decay", type=float, default=1e-4, help="Weight decay")
    parser.add_argument("--output-dir", type=str, default="./weights", help="Directory to save weights and metrics")
    return parser.parse_args()

def get_transforms():
    """
    Data Augmentation & Normalization:
    - RandomResizedCrop & RandomHorizontalFlip for generalization
    - ColorJitter to simulate varied kitchen/lighting conditions
    - ImageNet normalization
    """
    train_transform = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomResizedCrop(224, scale=(0.8, 1.0)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomVerticalFlip(p=0.2),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    val_test_transform = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    return train_transform, val_test_transform

def train_model(args):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training on device: {device}")
    os.makedirs(args.output_dir, exist_ok=True)

    train_tf, val_tf = get_transforms()

    train_path = os.path.join(args.dataset_dir, "train")
    val_path = os.path.join(args.dataset_dir, "val")

    if not os.path.exists(train_path) or not os.path.exists(val_path):
        print(f"[!] Dataset directory not found at {args.dataset_dir}. Run `python dataset.py` to prepare sample data or download the benchmark dataset.")
        return

    # ImageFolder sorts folders alphabetically (Aging=0, Fresh=1, Visibly Spoiled=2).
    # Explicitly remap targets to canonical FRESHNESS_CLASSES order (Fresh=0, Aging=1, Visibly Spoiled=2).
    train_dataset = datasets.ImageFolder(train_path, transform=train_tf)
    val_dataset = datasets.ImageFolder(val_path, transform=val_tf)

    train_idx_map = {
        folder_idx: FRESHNESS_CLASSES.index(cls_name)
        for cls_name, folder_idx in train_dataset.class_to_idx.items()
        if cls_name in FRESHNESS_CLASSES
    }
    val_idx_map = {
        folder_idx: FRESHNESS_CLASSES.index(cls_name)
        for cls_name, folder_idx in val_dataset.class_to_idx.items()
        if cls_name in FRESHNESS_CLASSES
    }
    train_dataset.target_transform = lambda y: train_idx_map[y]
    val_dataset.target_transform = lambda y: val_idx_map[y]

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=2, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=2)

    print(f"[*] Train samples: {len(train_dataset)}, Validation samples: {len(val_dataset)}")

    # Initialize model
    if args.model == "mobilenetv2":
        model = FoodFreshnessMobileNetV2(
            num_freshness_classes=len(FRESHNESS_CLASSES),
            num_category_classes=len(SUPPORTED_CATEGORIES),
            pretrained=True
        )
    else:
        model = FoodFreshnessResNet18(
            num_freshness_classes=len(FRESHNESS_CLASSES),
            num_category_classes=len(SUPPORTED_CATEGORIES),
            pretrained=True
        )

    model.to(device)

    # Loss function with label smoothing to prevent overconfidence
    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)
    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    best_acc = 0.0
    best_weights = copy.deepcopy(model.state_dict())
    training_history = []

    print("[*] Commencing training...")
    for epoch in range(1, args.epochs + 1):
        start_time = time.time()
        
        # Training Phase
        model.train()
        running_loss = 0.0
        correct_freshness = 0
        total_samples = 0

        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()

            freshness_logits, _ = model(images)
            loss = criterion(freshness_logits, labels)
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(freshness_logits, 1)
            correct_freshness += torch.sum(preds == labels.data).item()
            total_samples += images.size(0)

        scheduler.step()
        epoch_loss = running_loss / total_samples
        epoch_acc = (correct_freshness / total_samples) * 100.0

        # Validation Phase
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device)
                freshness_logits, _ = model(images)
                loss = criterion(freshness_logits, labels)

                val_loss += loss.item() * images.size(0)
                _, preds = torch.max(freshness_logits, 1)
                val_correct += torch.sum(preds == labels.data).item()
                val_total += images.size(0)

        val_epoch_loss = val_loss / val_total
        val_epoch_acc = (val_correct / val_total) * 100.0
        epoch_time = time.time() - start_time

        print(f"Epoch [{epoch:02d}/{args.epochs:02d}] "
              f"Train Loss: {epoch_loss:.4f} Acc: {epoch_acc:.2f}% | "
              f"Val Loss: {val_epoch_loss:.4f} Acc: {val_epoch_acc:.2f}% | "
              f"Time: {epoch_time:.1f}s")

        history_entry = {
            "epoch": epoch,
            "train_loss": round(epoch_loss, 4),
            "train_acc": round(epoch_acc, 2),
            "val_loss": round(val_epoch_loss, 4),
            "val_acc": round(val_epoch_acc, 2),
        }
        training_history.append(history_entry)

        if val_epoch_acc > best_acc:
            best_acc = val_epoch_acc
            best_weights = copy.deepcopy(model.state_dict())

    # Save best checkpoint
    save_path = os.path.join(args.output_dir, "best_freshness_model.pth")
    torch.save(best_weights, save_path)
    print(f"[+] Best validation accuracy: {best_acc:.2f}%")
    print(f"[+] Saved model checkpoint to {save_path}")

    # Save training metadata
    metadata = {
        "model_architecture": args.model,
        "epochs": args.epochs,
        "best_val_accuracy": round(best_acc, 2),
        "freshness_classes": FRESHNESS_CLASSES,
        "input_resolution": "224x224",
        "training_history": training_history,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    with open(os.path.join(args.output_dir, "model_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

if __name__ == "__main__":
    args = parse_args()
    train_model(args)
