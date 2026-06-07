"""
Module quản lý training và face data
"""

import os
import cv2
import numpy as np
import pickle
import torch
import json
from datetime import datetime
import shutil

from face_pipeline import get_device, get_facenet, save_aligned_face_jpg
from face_db_store import atomic_pickle_dump, load_face_database

MAX_TRAINING_IMAGES_PER_STUDENT = int(os.environ.get("MAX_TRAINING_IMAGES_PER_STUDENT", "1000"))
MAX_EMBEDDING_SAMPLES_PER_STUDENT = int(os.environ.get("MAX_EMBEDDING_SAMPLES_PER_STUDENT", "20"))
MAX_EMBEDDING_SAMPLES_AFTER_ONLINE = int(os.environ.get("MAX_EMBEDDING_SAMPLES_AFTER_ONLINE", "40"))
ONLINE_LEARNING_MIN_CONFIDENCE = float(os.environ.get("ONLINE_LEARNING_MIN_CONFIDENCE", "0.62"))
TRAINING_IMAGES_BASELINE = int(os.environ.get("TRAINING_IMAGES_BASELINE", "5733"))

class FaceTrainingManager:
    def __init__(self):
        self.root_dir = os.path.dirname(os.path.abspath(__file__))
        self.base_dir = os.path.join(self.root_dir, "dataset_raw")
        self.cropped_dir = os.path.join(self.root_dir, "dataset_cropped")
        self.model_path = os.path.join(self.root_dir, "models", "face_db.pkl")
        self.training_counter_path = os.path.join(self.root_dir, "models", "training_images_counter.json")
        os.makedirs(self.base_dir, exist_ok=True)
        os.makedirs(self.cropped_dir, exist_ok=True)
        os.makedirs(os.path.join(self.root_dir, "models"), exist_ok=True)
    
    def _read_training_counter_data(self):
        default_data = {
            "total_trained_images": int(TRAINING_IMAGES_BASELINE),
            "students": {},
        }
        if not os.path.exists(self.training_counter_path):
            return default_data
        try:
            with open(self.training_counter_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Backward-compatible: file cũ chỉ có 1 số tổng.
            if not isinstance(data, dict):
                data = default_data
            total = int(data.get("total_trained_images", TRAINING_IMAGES_BASELINE))
            students = data.get("students", {})
            if not isinstance(students, dict):
                students = {}
            return {
                "total_trained_images": max(int(TRAINING_IMAGES_BASELINE), total),
                "students": students,
            }
        except Exception:
            return default_data

    def _write_training_counter_data(self, total_value: int, students_map: dict):
        with open(self.training_counter_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "total_trained_images": int(total_value),
                    "students": students_map,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
    
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
            
            try:
                output_path = os.path.join(output_dir, filename)
                if not save_aligned_face_jpg(img, output_path):
                    errors.append(f"No face detected in {filename}")
                    continue
                cropped_count += 1
            except Exception as e:
                errors.append(f"Error processing {filename}: {str(e)}")
        
        return cropped_count, errors
    
    def extract_embeddings_for_student(self, ma_sv: str):
        """Extract embeddings cho một sinh viên (centroid + samples)."""
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
            
            # Convert BGR to RGB — chuẩn hóa giống MTCNN post_process / FaceNet
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img_resized = cv2.resize(img_rgb, (160, 160))
            
            img_tensor = torch.from_numpy(img_resized).permute(2, 0, 1).float()
            img_tensor = (img_tensor.unsqueeze(0) - 127.5) / 128.0
            
            dev = get_device()
            model = get_facenet()
            with torch.no_grad():
                emb = model(img_tensor.to(dev)).cpu().numpy()
            
            embeddings.append(emb.reshape(-1))
        
        if len(embeddings) == 0:
            return None, "No valid embeddings extracted"
        
        all_emb = np.asarray(embeddings, dtype=np.float32)
        avg_embedding = np.mean(all_emb, axis=0, keepdims=True).reshape(-1)
        n = np.linalg.norm(avg_embedding)
        if n > 1e-12:
            avg_embedding = (avg_embedding / n).astype(np.float32)
        # Giữ một tập sample để nhận diện ổn hơn khi thay đổi góc/ánh sáng.
        center = avg_embedding.reshape(1, -1)
        sims = np.dot(all_emb, center.T).reshape(-1)
        ranked_idx = np.argsort(-sims)
        topk = ranked_idx[: max(1, min(MAX_EMBEDDING_SAMPLES_PER_STUDENT, len(ranked_idx)))]
        sample_vecs = all_emb[topk]
        sample_vecs = sample_vecs / np.clip(np.linalg.norm(sample_vecs, axis=1, keepdims=True), 1e-12, None)
        sample_vecs = sample_vecs.astype(np.float32)

        return {
            "centroid": avg_embedding.astype(np.float32),
            "samples": sample_vecs,
            "num_raw_embeddings": int(len(all_emb)),
        }, None
    
    def train_student(self, ma_sv: str):
        """Train model cho một sinh viên - Full pipeline"""
        raw_images_count = len(self.get_training_images(ma_sv))
        # Step 1: Crop faces
        cropped_count, crop_errors = self.crop_faces_for_student(ma_sv)
        
        if cropped_count == 0:
            return {
                "success": False,
                "message": "No faces could be cropped",
                "errors": crop_errors
            }
        
        # Step 2: Extract embeddings
        emb_pack, emb_error = self.extract_embeddings_for_student(ma_sv)
        
        if emb_pack is None:
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

        previous_sample_count = 0
        previous_raw_embedding_count = 0
        if ma_sv in face_db:
            _, prev_samples = self._parse_entry(face_db.get(ma_sv))
            if isinstance(prev_samples, np.ndarray) and prev_samples.ndim == 2:
                previous_sample_count = int(prev_samples.shape[0])
            prev_raw = face_db.get(ma_sv, {}).get("num_raw_embeddings") if isinstance(face_db.get(ma_sv), dict) else None
            if prev_raw is not None:
                try:
                    previous_raw_embedding_count = int(prev_raw)
                except (TypeError, ValueError):
                    previous_raw_embedding_count = previous_sample_count

        face_db[ma_sv] = emb_pack

        current_sample_count = int(len(np.asarray(emb_pack["samples"])))
        current_raw_embedding_count = int(emb_pack.get("num_raw_embeddings", 0))
        added_sample_count = max(0, current_sample_count - previous_sample_count)
        added_raw_embedding_count = max(0, current_raw_embedding_count - previous_raw_embedding_count)

        atomic_pickle_dump(face_db, self.model_path)

        # Bộ đếm tổng ảnh huấn luyện toàn hệ thống:
        # giữ mốc gốc (mặc định 5733) và cộng dồn thêm theo từng lần train.
        counter_data = self._read_training_counter_data()
        baseline_before = int(counter_data.get("total_trained_images", TRAINING_IMAGES_BASELINE))
        student_map = counter_data.get("students", {})
        student_before = int(student_map.get(ma_sv, 0) or 0)
        # Theo yêu cầu: mỗi lần bấm train thành công đều cộng theo số ảnh đang có trong thư viện train
        # (ví dụ có 35 ảnh thì lần đó cộng +35, kể cả ảnh cũ train lại).
        increment_this_train = int(max(0, raw_images_count))
        baseline_after = baseline_before + increment_this_train
        student_after = student_before + increment_this_train
        student_map[ma_sv] = int(student_after)
        self._write_training_counter_data(baseline_after, student_map)

        return {
            "success": True,
            "message": "Training completed successfully",
            "cropped_count": cropped_count,
            "embedding_shape": np.asarray(emb_pack["centroid"]).shape,
            "sample_count": current_sample_count,
            "raw_embedding_count": current_raw_embedding_count,
            "previous_sample_count": previous_sample_count,
            "previous_raw_embedding_count": previous_raw_embedding_count,
            "added_sample_count": added_sample_count,
            "added_raw_embedding_count": added_raw_embedding_count,
            "total_identities": len(face_db),
            "student_trained_images_total": current_raw_embedding_count,
            "total_trained_images_all_students": int(baseline_after),
            "system_images_counter_before": int(baseline_before),
            "system_images_counter_added": int(increment_this_train),
            "system_images_counter_after": int(baseline_after),
            "student_images_counter_before": int(student_before),
            "student_images_counter_after": int(student_after),
            "raw_images_count": int(raw_images_count),
        }

    def _normalize_embedding(self, vec):
        v = np.asarray(vec, dtype=np.float32).reshape(-1)
        n = np.linalg.norm(v)
        if n < 1e-12:
            return None
        return (v / n).astype(np.float32)

    def _parse_entry(self, entry):
        if isinstance(entry, dict):
            c = self._normalize_embedding(entry.get("centroid"))
            s = np.asarray(entry.get("samples", []), dtype=np.float32)
            if s.ndim == 1 and s.size > 0:
                s = s.reshape(1, -1)
            if s.size == 0 and c is not None:
                s = c.reshape(1, -1)
            if s.size > 0:
                s = s / np.clip(np.linalg.norm(s, axis=1, keepdims=True), 1e-12, None)
            return c, s.astype(np.float32) if s.size > 0 else np.empty((0,), dtype=np.float32)
        c = self._normalize_embedding(entry)
        if c is None:
            return None, np.empty((0,), dtype=np.float32)
        return c, c.reshape(1, -1)

    def append_online_sample(self, ma_sv: str, embedding, confidence: float):
        """
        Cộng dồn mẫu embedding từ lần nhận diện thành công để tăng độ ổn định theo thời gian.
        Chỉ lưu khi confidence đủ cao để tránh "học sai".
        """
        if embedding is None or float(confidence) < ONLINE_LEARNING_MIN_CONFIDENCE:
            return {"updated": False, "reason": "low_confidence_or_empty"}

        vec = self._normalize_embedding(embedding)
        if vec is None:
            return {"updated": False, "reason": "invalid_embedding"}

        face_db = {}
        if os.path.exists(self.model_path):
            with open(self.model_path, "rb") as f:
                face_db = pickle.load(f)

        old = face_db.get(ma_sv)
        if old is None:
            samples = vec.reshape(1, -1)
        else:
            _, old_samples = self._parse_entry(old)
            if old_samples.ndim != 2 or old_samples.shape[1] != vec.shape[0]:
                old_samples = vec.reshape(1, -1)
            samples = np.vstack([old_samples, vec.reshape(1, -1)])

        # Giữ cửa sổ mẫu gần nhất để DB không phình quá mức.
        if samples.shape[0] > MAX_EMBEDDING_SAMPLES_AFTER_ONLINE:
            samples = samples[-MAX_EMBEDDING_SAMPLES_AFTER_ONLINE:]

        centroid = np.mean(samples, axis=0)
        centroid = self._normalize_embedding(centroid)
        if centroid is None:
            return {"updated": False, "reason": "centroid_failed"}

        face_db[ma_sv] = {
            "centroid": centroid.astype(np.float32),
            "samples": samples.astype(np.float32),
            "num_raw_embeddings": int(samples.shape[0]),
        }
        atomic_pickle_dump(face_db, self.model_path)
        return {"updated": True, "sample_count": int(samples.shape[0])}
    
    def get_face_database_info(self):
        """Lấy thông tin face database (cùng nguồn cache mtime với nhận diện)."""
        face_db = load_face_database()
        if not face_db:
            return {
                "loaded": False,
                "identities_count": 0,
                "identities": [],
            }
        return {
            "loaded": True,
            "identities_count": len(face_db),
            "identities": list(face_db.keys()),
        }
    
    def remove_from_database(self, ma_sv: str):
        """Xóa sinh viên khỏi face database"""
        if not os.path.exists(self.model_path):
            return False
        
        with open(self.model_path, "rb") as f:
            face_db = pickle.load(f)
        
        if ma_sv in face_db:
            del face_db[ma_sv]
            atomic_pickle_dump(face_db, self.model_path)
            return True
        
        return False

# Singleton instance
training_manager = FaceTrainingManager()