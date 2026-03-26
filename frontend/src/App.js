import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Box from '@mui/material/Box';

import { AppThemeProvider } from './theme/AppThemeContext';
import { AuthProvider } from './auth/AuthContext';
import { I18nProvider } from './i18n/I18nContext';
import RequireAuth from './auth/RequireAuth';

// Layout
import MainLayout from './components/Layout/MainLayout';

// Pages
import Dashboard from './pages/Dashboard';
import StudentList from './pages/StudentList';
import StudentDetail from './pages/StudentDetail';
import StudentTraining from './pages/StudentTraining';
import SessionManagement from './pages/SessionManagement';
import AnalyticsReport from './pages/AnalyticsReport';
import SettingsPage from './pages/SettingsPage';
import NotAuthorized from './pages/NotAuthorized';
import AdminUserManagement from './pages/AdminUserManagement';
import AdminTeachingManagementPage from './pages/admin/AdminTeachingManagementPage';
import AdminClassCreationPage from './pages/admin/AdminClassCreationPage';
import StudentPortalHome from './pages/student/StudentPortalHome';
import StudentSessionsPage from './pages/student/StudentSessionsPage';
import StudentCoursesPage from './pages/student/StudentCoursesPage';
import StudentFeedbackPage from './pages/student/StudentFeedbackPage';
import StudentProfilePage from './pages/student/StudentProfilePage';
import StudentAttendancePage from './pages/student/StudentAttendancePage';
import TeacherSessionsPage from './pages/teacher/TeacherSessionsPage';
import TeacherProfilePage from './pages/teacher/TeacherProfilePage';
import TeacherCareerPage from './pages/teacher/TeacherCareerPage';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

function App() {
  return (
    <AuthProvider>
      <AppThemeProvider>
        <I18nProvider>
          <Router>
            <Box sx={{ display: 'flex', minHeight: '100vh' }}>
              <Routes>
                {/* Auth */}
                <Route path="/auth/login" element={<LoginPage />} />
                <Route path="/auth/register" element={<RegisterPage />} />
                <Route path="/auth/verify" element={<Navigate to="/auth/login" replace />} />
                <Route path="/auth/forgot" element={<Navigate to="/auth/login" replace />} />
                <Route path="/auth/reset-password-email" element={<Navigate to="/auth/login" replace />} />

                {/* Main app */}
                <Route path="/" element={<MainLayout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />

                  {/* Protected */}
                  <Route element={<RequireAuth roles={['ADMIN', 'TEACHER', 'STUDENT']} />}>
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="students/:maSV" element={<StudentDetail />} />
                    <Route path="settings" element={<SettingsPage />} />

                    {/* Sinh viên — cổng riêng */}
                    <Route element={<RequireAuth roles={['STUDENT']} />}>
                      <Route path="student" element={<StudentPortalHome />} />
                      <Route path="student/attendance" element={<StudentAttendancePage />} />
                      <Route path="student/sessions" element={<StudentSessionsPage />} />
                      <Route path="student/courses" element={<StudentCoursesPage />} />
                      <Route path="student/feedback" element={<StudentFeedbackPage />} />
                      <Route path="student/profile" element={<StudentProfilePage />} />
                    </Route>

                    {/* Teacher/Admin — danh sách SV */}
                    <Route element={<RequireAuth roles={['TEACHER', 'ADMIN']} />}>
                      <Route path="students" element={<StudentList />} />
                    </Route>

                    {/* Admin — quản lý buổi toàn hệ thống + huấn luyện khuôn mặt */}
                    <Route element={<RequireAuth roles={['ADMIN']} />}>
                      <Route path="sessions" element={<SessionManagement />} />
                      <Route path="students/:maSV/training" element={<StudentTraining />} />
                    </Route>

                    {/* Giảng viên — đăng ký buổi học & hồ sơ */}
                    <Route element={<RequireAuth roles={['TEACHER']} />}>
                      <Route path="teacher/sessions" element={<TeacherSessionsPage />} />
                      <Route path="teacher/career" element={<TeacherCareerPage />} />
                      <Route path="teacher/profile" element={<TeacherProfilePage />} />
                    </Route>

                    {/* Admin/Teacher analytics */}
                    <Route element={<RequireAuth roles={['ADMIN', 'TEACHER']} />}>
                      <Route path="analytics" element={<AnalyticsReport />} />
                    </Route>

                    {/* Admin-only */}
                    <Route element={<RequireAuth roles={['ADMIN']} />}>
                      <Route path="admin/users" element={<AdminUserManagement />} />
                      <Route path="admin/classes" element={<AdminClassCreationPage />} />
                      <Route path="admin/teaching" element={<AdminTeachingManagementPage />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Route>
                </Route>

                <Route path="/not-authorized" element={<NotAuthorized />} />
              </Routes>
            </Box>
          </Router>
        </I18nProvider>
      </AppThemeProvider>
    </AuthProvider>
  );
}

export default App;
