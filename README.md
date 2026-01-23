<<<<<<< HEAD
# SmartAttendanceAI# SmartAttendanceAI
=======
# SmartAttendanceAI
>>>>>>> fa2a1f221ae2c1b471d452baf6f63f95ef7c407b

## Overview

SmartAttendanceAI is an AI-based attendance system using face recognition to automate student attendance, reduce fraud, and improve accuracy.

## Key Features

* Face detection and recognition using YOLOv8
* Real-time attendance via webcam/video
* RESTful API built with FastAPI
* Centralized data storage and reporting

## Tech Stack

**Backend:** Python 3.10, FastAPI, OpenCV, YOLOv8, PyTorch

**Frontend:** ReactJS, HTML, CSS, JavaScript

**Database:** SQL Server

## Dataset & Model

* Face images collected via webcam
* YOLOv8 pre-trained face detection model
* Face embeddings for identity matching

## How to Run

### Backend

```bash
cd backend
python -m venv venv
venv\\Scripts\\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm start
```

### Database

* Use SQL Server
* Import the provided `.sql` file to initialize the database
* Update database connection settings in backend config

## Use Case

* Classroom attendance
* Exams and training centers
* Small to medium-scale deployments

## Author

Smart Data Challenge – Team Project
