import cv2
import os
import pickle
import torch
import numpy as np
from facenet_pytorch import InceptionResnetV1

DATASET_PATH = "dataset_cropped"
OUTPUT_PATH = "models/face_db.pkl"

print(">>> Loading FaceNet model...")
model = InceptionResnetV1(pretrained='vggface2').eval()

database = {}

if not os.path.exists(DATASET_PATH):
    print("❌ Không tìm thấy thư mục dataset_cropped")
    exit()

persons = os.listdir(DATASET_PATH)
print(f">>> Found {len(persons)} persons")

for person in persons:
    person_path = os.path.join(DATASET_PATH, person)
    if not os.path.isdir(person_path):
        continue

    print(f"\n>>> Processing: {person}")
    embeddings = []

    images = os.listdir(person_path)
    print(f"    Images: {len(images)}")

    for img_name in images:
        img_path = os.path.join(person_path, img_name)
        image = cv2.imread(img_path)

        if image is None:
            print(f"    ⚠️ Cannot read {img_name}")
            continue

        image = cv2.resize(image, (160, 160))
        image = torch.from_numpy(image).permute(2,0,1).float()
        image = image.unsqueeze(0) / 255.0

        with torch.no_grad():
            emb = model(image).numpy()

        embeddings.append(emb)

    if len(embeddings) == 0:
        print(f"    ❌ No valid images for {person}")
        continue

    database[person] = np.mean(embeddings, axis=0)
    print(f"    ✅ Saved embedding for {person}")

os.makedirs("models", exist_ok=True)

with open(OUTPUT_PATH, "wb") as f:
    pickle.dump(database, f)

print("\n🎉 DONE! Saved face_db.pkl")
print(f">>> Total identities: {len(database)}")


#  python scripts/extract_embedding.py