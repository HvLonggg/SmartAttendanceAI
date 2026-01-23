"""
Module quản lý training và face data
"""

import os
import cv2
import numpy as np
import pickle
import torch
from facenet_pytorch import InceptionResnetV1
from ultralytics import YOLO
from datetime import datetime
import shutil

# Load models
facenet_model = InceptionResnetV1(pretrained='vggface2').eval()
yolo_model = YOLO("yolov8n.pt")

class FaceTrainingManager:
    def __init__(self):
        self.base_dir = "dataset_raw"
        self.cropped_dir = "dataset_cropped"
        self.model_path = "models/face_db.pkl"
        os.makedirs(self.base_dir, exist_ok=True)
        os.makedirs(self.cropped_dir, exist_ok=True)
        os.makedirs("models", exist_ok=True)
    
    def save_training_image(self, ma_sv: str, image_bytes: bytes, filename: str = None):
        """Lưu ảnh training cho sinh viên"""
        student_dir = os.path.join(self.base_dir, ma_sv)
        os.makedirs(student_dir, exist_ok=True)
        
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"img_{timestamp}.jpg"
        
        filepath = os.path.join(student_dir, filename)
        
        # Decode và save
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return None, "Invalid image"
        
        cv2.imwrite(filepath, img)
        return filepath, None
    
    def get_training_images(self, ma_sv: str):
        """Lấy danh sách ảnh training của sinh viên"""
        student_dir = os.path.join(self.base_dir, ma_sv)
        
        if not os.path.exists(student_dir):
            return []
        
        images = []
        for filename in os.listdir(student_dir):
            if filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                filepath = os.path.join(student_dir, filename)
                images.append({
                    "filename": filename,
                    "path": filepath,
                    "size": os.path.getsize(filepath)
                })
        
        return images
    
    def delete_training_image(self, ma_sv: str, filename: str):
        """Xóa ảnh training"""
        filepath = os.path.join(self.base_dir, ma_sv, filename)
        
        if os.path.exists(filepath):
            os.remove(filepath)
            return True
        return False
    
    def delete_all_training_images(self, ma_sv: str):
        """Xóa tất cả ảnh training của sinh viên"""
        student_dir = os.path.join(self.base_dir, ma_sv)
        
        if os.path.exists(student_dir):
            shutil.rmtree(student_dir)
            return True
        return False
    
    def crop_faces_for_student(self, ma_sv: str):
        """Crop faces cho một sinh viên"""
        input_dir = os.path.join(self.base_dir, ma_sv)
        output_dir = os.path.join(self.cropped_dir, ma_sv)
        
        if not os.path.exists(input_dir):
            return 0, "No training images found"
        
        os.makedirs(output_dir, exist_ok=True)
        
        cropped_count = 0
        errors = []
        
        for filename in os.listdir(input_dir):
            if not filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                continue
            
            img_path = os.path.join(input_dir, filename)
            img = cv2.imread(img_path)
            
            if img is None:
                errors.append(f"Cannot read {filename}")
                continue
            
            # Detect face with YOLO
            try:
                results = yolo_model(img, verbose=False)
                
                if len(results[0].boxes) == 0:
                    errors.append(f"No face detected in {filename}")
                    continue
                
                # Crop first detected face
                box = results[0].boxes.xyxy[0].cpu().numpy()
                x1, y1, x2, y2 = map(int, box)
                
                # Add margin
                h, w = img.shape[:2]
                margin = 20
                x1 = max(0, x1 - margin)
                y1 = max(0, y1 - margin)
                x2 = min(w, x2 + margin)
                y2 = min(h, y2 + margin)
                
                face = img[y1:y2, x1:x2]
                face_resized = cv2.resize(face, (160, 160))
                
                output_path = os.path.join(output_dir, filename)
                cv2.imwrite(output_path, face_resized)
                cropped_count += 1
                
            except Exception as e:
                errors.append(f"Error processing {filename}: {str(e)}")
        
        return cropped_count, errors
    
    def extract_embeddings_for_student(self, ma_sv: str):
        """Extract embeddings cho một sinh viên"""
        cropped_dir = os.path.join(self.cropped_dir, ma_sv)
        
        if not os.path.exists(cropped_dir):
            return None, "No cropped faces found. Run crop first."
        
        embeddings = []
        
        for filename in os.listdir(cropped_dir):
            if not filename.lower().endswith(('.jpg', '.jpeg', '.png')):
                continue
            
            img_path = os.path.join(cropped_dir, filename)
            img = cv2.imread(img_path)
            
            if img is None:
                continue
            
            # Convert BGR to RGB
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img_resized = cv2.resize(img_rgb, (160, 160))
            
            # Convert to tensor
            img_tensor = torch.from_numpy(img_resized).permute(2, 0, 1).float()
            img_tensor = img_tensor.unsqueeze(0) / 255.0
            
            # Extract embedding
            with torch.no_grad():
                emb = facenet_model(img_tensor).cpu().numpy()
            
            embeddings.append(emb)
        
        if len(embeddings) == 0:
            return None, "No valid embeddings extracted"
        
        # Average all embeddings
        avg_embedding = np.mean(embeddings, axis=0)
        
        return avg_embedding, None
    
    def train_student(self, ma_sv: str):
        """Train model cho một sinh viên - Full pipeline"""
        # Step 1: Crop faces
        cropped_count, crop_errors = self.crop_faces_for_student(ma_sv)
        
        if cropped_count == 0:
            return {
                "success": False,
                "message": "No faces could be cropped",
                "errors": crop_errors
            }
        
        # Step 2: Extract embeddings
        embedding, emb_error = self.extract_embeddings_for_student(ma_sv)
        
        if embedding is None:
            return {
                "success": False,
                "message": emb_error,
                "cropped_count": cropped_count
            }
        
        # Step 3: Update face database
        face_db = {}
        if os.path.exists(self.model_path):
            with open(self.model_path, "rb") as f:
                face_db = pickle.load(f)
        
        face_db[ma_sv] = embedding
        
        with open(self.model_path, "wb") as f:
            pickle.dump(face_db, f)
        
        return {
            "success": True,
            "message": "Training completed successfully",
            "cropped_count": cropped_count,
            "embedding_shape": embedding.shape,
            "total_identities": len(face_db)
        }
    
    def get_face_database_info(self):
        """Lấy thông tin face database"""
        if not os.path.exists(self.model_path):
            return {
                "loaded": False,
                "identities_count": 0,
                "identities": []
            }
        
        with open(self.model_path, "rb") as f:
            face_db = pickle.load(f)
        
        return {
            "loaded": True,
            "identities_count": len(face_db),
            "identities": list(face_db.keys())
        }
    
    def remove_from_database(self, ma_sv: str):
        """Xóa sinh viên khỏi face database"""
        if not os.path.exists(self.model_path):
            return False
        
        with open(self.model_path, "rb") as f:
            face_db = pickle.load(f)
        
        if ma_sv in face_db:
            del face_db[ma_sv]
            
            with open(self.model_path, "wb") as f:
                pickle.dump(face_db, f)
            
            return True
        
        return False

# Singleton instance
training_manager = FaceTrainingManager()