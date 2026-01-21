import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL 
  ? `${process.env.REACT_APP_API_URL}/api` 
  : 'http://localhost:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ==================== STUDENTS ====================

export const studentAPI = {
  getAll: () => apiClient.get('/students'),
  
  getById: (maSV) => apiClient.get(`/students/${maSV}`),
  
  create: (studentData) => apiClient.post('/students', studentData),
  
  update: (maSV, studentData) => apiClient.put(`/students/${maSV}`, studentData),
  
  delete: (maSV) => apiClient.delete(`/students/${maSV}`),
};

// ==================== FACE RECOGNITION ====================

export const recognitionAPI = {
  recognizeFace: (imageFile) => {
    const formData = new FormData();
    formData.append('file', imageFile);
    
    return apiClient.post('/recognize', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  recognizeFromBase64: (base64Image) => {
    // Convert base64 to blob
    const byteString = atob(base64Image.split(',')[1]);
    const mimeString = base64Image.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    
    const blob = new Blob([ab], { type: mimeString });
    const file = new File([blob], 'capture.jpg', { type: mimeString });
    
    return recognitionAPI.recognizeFace(file);
  },
};

// ==================== ATTENDANCE ====================

export const attendanceAPI = {
  getTodaySessions: () => apiClient.get('/sessions/today'),
  
  checkin: (maSV, maBuoi) => apiClient.post('/attendance/checkin', null, {
    params: { ma_sv: maSV, ma_buoi: maBuoi },
  }),
  
  getSessionAttendance: (maBuoi) => 
    apiClient.get(`/attendance/session/${maBuoi}`),
  
  getStudentHistory: (maSV, startDate, endDate) => 
    apiClient.get(`/attendance/student/${maSV}`, {
      params: { start_date: startDate, end_date: endDate },
    }),
};

// ==================== ANALYTICS ====================

export const analyticsAPI = {
  getDashboardStats: () => apiClient.get('/analytics/dashboard'),
  
  getStudentAnalytics: (maSV) => 
    apiClient.get(`/analytics/student/${maSV}`),
  
  getClassAnalytics: (maLHP) => 
    apiClient.get(`/analytics/class/${maLHP}`),
  
  getAttendanceTrend: (maLHP, period = 'week') => 
    apiClient.get(`/analytics/trend/${maLHP}`, {
      params: { period },
    }),
  
  getStudentBehaviorAnalysis: (maSV) =>
    apiClient.get(`/analytics/behavior/${maSV}`),
};

// ==================== WEBSOCKET CONNECTION ====================

export class CameraWebSocket {
  constructor(onMessage, onError) {
    this.ws = null;
    this.onMessage = onMessage;
    this.onError = onError;
  }
  
  connect() {
    this.ws = new WebSocket('ws://localhost:8000/ws/camera');
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (this.onMessage) {
        this.onMessage(data);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (this.onError) {
        this.onError(error);
      }
    };
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
    };
  }
  
  sendFrame(base64Frame) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ frame: base64Frame }));
    }
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

export default {
  studentAPI,
  recognitionAPI,
  attendanceAPI,
  analyticsAPI,
  CameraWebSocket,
};