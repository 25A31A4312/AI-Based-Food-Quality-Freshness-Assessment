"""
T238 – AI-Based Food Quality & Freshness Assessment
Dataset Setup and Directory Structure Generator

Expected Structure:
dataset/
  train/
    Fresh/
    Aging/
    Visibly Spoiled/
  val/
    Fresh/
    Aging/
    Visibly Spoiled/
  test/
    Fresh/
    Aging/
    Visibly Spoiled/
"""

import os
import argparse
from PIL import Image, ImageDraw

FRESHNESS_CLASSES = ["Fresh", "Aging", "Visibly Spoiled"]

def setup_dataset_structure(base_dir: str = "./dataset", create_samples: bool = False):
    """
    Creates standard split directory folders to prevent data leakage.
    """
    splits = ["train", "val", "test"]
    for split in splits:
        for cls in FRESHNESS_CLASSES:
            dir_path = os.path.join(base_dir, split, cls)
            os.makedirs(dir_path, exist_ok=True)
            print(f"[+] Verified directory: {dir_path}")

    if create_samples:
        print("[*] Generating synthetic sample images for pipeline testing...")
        color_map = {
            "Fresh": (34, 197, 94),          # Fresh vibrant green
            "Aging": (234, 179, 8),           # Aging yellow-brown
            "Visibly Spoiled": (120, 53, 15)  # Dark necrosis brown
        }
        for split in splits:
            count = 10 if split == "train" else 4
            for cls, color in color_map.items():
                target_folder = os.path.join(base_dir, split, cls)
                for i in range(count):
                    img = Image.new("RGB", (224, 224), color=color)
                    draw = ImageDraw.Draw(img)
                    if cls == "Visibly Spoiled":
                        # Add dark spots and mold-like patches
                        draw.ellipse([60, 60, 110, 110], fill=(20, 20, 20))
                        draw.ellipse([120, 130, 160, 170], fill=(200, 220, 200))
                    elif cls == "Aging":
                        # Add wrinkles and browning spots
                        draw.line([(40, 100), (180, 100)], fill=(160, 110, 30), width=4)
                        draw.ellipse([140, 60, 165, 85], fill=(130, 80, 20))
                    file_path = os.path.join(target_folder, f"sample_{cls.lower().replace(' ', '_')}_{i+1}.jpg")
                    img.save(file_path, "JPEG")
        print("[+] Generated test sample dataset successfully.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=str, default="./dataset")
    parser.add_argument("--generate-samples", action="store_true", help="Generate synthetic samples for smoke testing")
    args = parser.parse_args()

    setup_dataset_structure(args.dir, create_samples=args.generate_samples)
