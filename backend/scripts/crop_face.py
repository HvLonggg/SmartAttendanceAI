"""
Batch crop khuôn mặt (đồng bộ API): MTCNN căn chỉnh 160x160 — không dùng YOLO COCO.

Chạy từ thư mục backend:
  python scripts/crop_face.py
"""
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

import cv2
from face_pipeline import save_aligned_face_jpg

input_dir = "dataset_raw"
output_dir = "dataset_cropped"
os.makedirs(output_dir, exist_ok=True)

for person in os.listdir(input_dir):
    in_path = os.path.join(input_dir, person)
    if not os.path.isdir(in_path):
        continue
    out_path = os.path.join(output_dir, person)
    os.makedirs(out_path, exist_ok=True)

    for img_name in os.listdir(in_path):
        if not img_name.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        img_path = os.path.join(in_path, img_name)
        img = cv2.imread(img_path)
        if img is None:
            continue
        out_file = os.path.join(out_path, img_name)
        if save_aligned_face_jpg(img, out_file):
            print("ok", person, img_name)
        else:
            print("skip (no face)", person, img_name)
