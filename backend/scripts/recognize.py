from sklearn.metrics.pairwise import cosine_similarity
import pickle

database = pickle.load(open("models/face_db.pkl","rb"))

def recognize(face_embedding):
    best_score = 0
    identity = "Unknown"

    for name, emb in database.items():
        score = cosine_similarity(face_embedding, emb)[0][0]
        if score > best_score and score > 0.7:
            best_score = score
            identity = name

    return identity, best_score
