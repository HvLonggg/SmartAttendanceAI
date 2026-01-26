import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL 
  ? `${process.env.REACT_APP_API_URL}/api` 
  : 'http://localhost:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds
});

// Interceptor để log errors
apiClient.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data
    });
    return Promise.reject(error);
  }
);

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

// ==================== TRAINING ====================

export const trainingAPI = {
  uploadImage: (maSV, imageFile) => {
    const formData = new FormData();
    formData.append('file', imageFile);
    
    return apiClient.post(`/training/upload-image/${maSV}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  getImages: (maSV) => apiClient.get(`/training/images/${maSV}`),
  
  getImage: (maSV, filename) => 
    apiClient.get(`/training/image/${maSV}/${filename}`, {
      responseType: 'blob'
    }),
  
  deleteImage: (maSV, filename) => 
    apiClient.delete(`/training/image/${maSV}/${filename}`),
  
  train: (maSV) => apiClient.post(`/training/train/${maSV}`),
  
  getStatus: (maSV) => apiClient.get(`/training/status/${maSV}`),
  
  removeAll: (maSV) => apiClient.delete(`/training/remove/${maSV}`),
  
  getDatabaseInfo: () => apiClient.get('/training/database-info'),
};

// ==================== ATTENDANCE ====================

export const attendanceAPI = {
  getTodaySessions: () => apiClient.get('/sessions/today'),
  
  getSessionsByDate: (date) => apiClient.get('/sessions/by-date', {
    params: { date }
  }),
  
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
  // Dashboard stats
  getDashboardStats: () => apiClient.get('/analytics/dashboard'),
  
  // Student analytics
  getStudentAnalytics: (maSV) => 
    apiClient.get(`/analytics/student/${maSV}`),
  
  // Attendance trends
  getAttendanceTrend: (days = 7) => 
    apiClient.get('/analytics/attendance-trend', {
      params: { days }
    }),
  
  // Status distribution
  getStatusDistribution: () => 
    apiClient.get('/analytics/status-distribution'),
  
  // Top students
  getTopStudents: (limit = 5) => 
    apiClient.get('/analytics/top-students', {
      params: { limit }
    }),
  
  // At-risk students
  getAtRiskStudents: () => 
    apiClient.get('/analytics/at-risk-students'),
  
  // Class comparison
  getClassComparison: () => 
    apiClient.get('/analytics/class-comparison'),
  
  // Recent activities
  getRecentActivities: (limit = 10) => 
    apiClient.get('/analytics/recent-activities', {
      params: { limit }
    }),
  
  // Legacy endpoints (compatibility)
  getClassAnalytics: (maLHP) => 
    apiClient.get(`/analytics/class/${maLHP}`),
  
  getAttendanceTrendLegacy: (maLHP, period = 'week') => 
    apiClient.get(`/analytics/trend/${maLHP}`, {
      params: { period },
    }),
  
  getStudentBehaviorAnalysis: (maSV) =>
    apiClient.get(`/analytics/behavior/${maSV}`),
};

// ==================== SESSIONS ====================

export const sessionAPI = {
  getAll: () => apiClient.get('/sessions/today'),
  
  getByDate: (date) => apiClient.get('/sessions/by-date', {
    params: { date }
  }),
  
  getById: (maBuoi) => apiClient.get(`/sessions/${maBuoi}`),
  
  create: (sessionData) => apiClient.post('/sessions', sessionData),
  
  update: (maBuoi, sessionData) => 
    apiClient.put(`/sessions/${maBuoi}`, sessionData),
  
  delete: (maBuoi) => apiClient.delete(`/sessions/${maBuoi}`),
};

// ==================== WEBSOCKET CONNECTION ====================

export class CameraWebSocket {
  constructor(onMessage, onError, onOpen, onClose) {
    this.ws = null;
    this.onMessage = onMessage;
    this.onError = onError;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }
  
  connect() {
    const wsUrl = API_BASE_URL.replace('http', 'ws').replace('/api', '');
    this.ws = new WebSocket(`${wsUrl}/ws/camera`);
    
    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      if (this.onOpen) this.onOpen();
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (this.onMessage) {
          this.onMessage(data);
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err);
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
      if (this.onClose) this.onClose();
      
      // Auto reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
        setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
      }
    };
  }
  
  sendFrame(base64Frame) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ frame: base64Frame }));
      } catch (err) {
        console.error('WebSocket send error:', err);
      }
    }
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
  
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

// ==================== HEALTH CHECK ====================

export const healthAPI = {
  ping: () => apiClient.get('/'),
  
  status: () => apiClient.get('/health'),
};

// ==================== UTILITY FUNCTIONS ====================

export const utils = {
  // Format date for API
  formatDate: (date) => {
    if (!date) return null;
    const d = new Date(date);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  },
  
  // Format time for API
  formatTime: (time) => {
    if (!time) return null;
    return time; // HH:MM:SS
  },
  
  // Parse API date
  parseDate: (dateString) => {
    if (!dateString) return null;
    return new Date(dateString);
  },
  
  // Check if API is available
  checkAPI: async () => {
    try {
      await healthAPI.ping();
      return true;
    } catch (err) {
      return false;
    }
  },
};

// Export default object with all APIs
export default {
  studentAPI,
  recognitionAPI,
  trainingAPI,
  attendanceAPI,
  analyticsAPI,
  sessionAPI,
  healthAPI,
  utils,
  CameraWebSocket,
};