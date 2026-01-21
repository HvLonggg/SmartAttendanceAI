from ultralytics import YOLO
import cv2, os

model = YOLO("yolov8n.pt")

input_dir = "dataset_raw"
output_dir = "dataset_cropped"
os.makedirs(output_dir, exist_ok=True)

for person in os.listdir(input_dir):
    in_path = os.path.join(input_dir, person)
    out_path = os.path.join(output_dir, person)
    os.makedirs(out_path, exist_ok=True)

    for img_name in os.listdir(in_path):
        img_path = os.path.join(in_path, img_name)
        img = cv2.imread(img_path)
        if img is None:
            continue

        results = model(img)
        if len(results[0].boxes) == 0:
            continue

        x1,y1,x2,y2 = map(int, results[0].boxes.xyxy[0])
        face = img[y1:y2, x1:x2]
        face = cv2.resize(face, (160,160))

        cv2.imwrite(os.path.join(out_path, img_name), face)

#  python scripts/crop_face.py
