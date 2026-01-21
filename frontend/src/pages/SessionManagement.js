import { Grid } from '@mui/material';
import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Badge,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Refresh as RefreshIcon,
  Event as EventIcon,
  CheckCircle as CheckIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { attendanceAPI } from '../services/api';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`session-tabpanel-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

function SessionManagement() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [attendanceList, setAttendanceList] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    fetchTodaySessions();
  }, []);

  const fetchTodaySessions = async () => {
    try {
      setLoading(true);
      const response = await attendanceAPI.getTodaySessions();
      setSessions(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError('Không thể tải danh sách buổi học');
    } finally {
      setLoading(false);
    }
  };

  const handleViewAttendance = async (session) => {
    try {
      setSelectedSession(session);
      setLoading(true);
      const response = await attendanceAPI.getSessionAttendance(session.ma_buoi);
      setAttendanceList(response.data);
      setOpenDialog(true);
    } catch (err) {
      console.error('Error fetching attendance:', err);
      setError('Không thể tải danh sách điểm danh');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedSession(null);
    setAttendanceList([]);
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // Lọc buổi học theo trạng thái
  const upcomingSessions = sessions.filter(s => {
    const sessionTime = new Date(`${s.ngay_hoc}T${s.gio_bat_dau}`);
    return sessionTime > new Date();
  });

  const ongoingSessions = sessions.filter(s => {
    const sessionStart = new Date(`${s.ngay_hoc}T${s.gio_bat_dau}`);
    const sessionEnd = new Date(sessionStart.getTime() + 3 * 60 * 60 * 1000); // +3 giờ
    const now = new Date();
    return now >= sessionStart && now <= sessionEnd;
  });

  const completedSessions = sessions.filter(s => {
    const sessionStart = new Date(`${s.ngay_hoc}T${s.gio_bat_dau}`);
    const sessionEnd = new Date(sessionStart.getTime() + 3 * 60 * 60 * 1000);
    return sessionEnd < new Date();
  });

  // Thống kê cho buổi học
  const getSessionStats = (sessionId) => {
    // Đây là mock data, thực tế cần gọi API
    return {
      total: 50,
      attended: 45,
      late: 5,
      absent: 5,
    };
  };

  const SessionTable = ({ sessions: sessionList }) => (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Mã buổi</TableCell>
            <TableCell>Môn học</TableCell>
            <TableCell>Giảng viên</TableCell>
            <TableCell>Ngày học</TableCell>
            <TableCell>Giờ bắt đầu</TableCell>
            <TableCell>Trạng thái</TableCell>
            <TableCell align="right">Thao tác</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sessionList.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} align="center">
                <Typography color="text.secondary" sx={{ py: 3 }}>
                  Không có buổi học nào
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            sessionList.map((session) => {
              const sessionTime = new Date(`${session.ngay_hoc}T${session.gio_bat_dau}`);
              const isToday = new Date(session.ngay_hoc).toDateString() === new Date().toDateString();

              return (
                <TableRow key={session.ma_buoi} hover>
                  <TableCell>{session.ma_buoi}</TableCell>
                  <TableCell>
                    <Typography fontWeight={500}>{session.ten_mon}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {session.ma_lhp}
                    </Typography>
                  </TableCell>
                  <TableCell>{session.giang_vien}</TableCell>
                  <TableCell>
                    {new Date(session.ngay_hoc).toLocaleDateString('vi-VN')}
                    {isToday && (
                      <Chip label="Hôm nay" color="primary" size="small" sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <ScheduleIcon fontSize="small" sx={{ mr: 0.5 }} />
                      {session.gio_bat_dau}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {tabValue === 0 && (
                      <Chip label="Sắp diễn ra" color="info" size="small" />
                    )}
                    {tabValue === 1 && (
                      <Chip label="Đang diễn ra" color="success" size="small" />
                    )}
                    {tabValue === 2 && (
                      <Chip label="Đã kết thúc" color="default" size="small" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handleViewAttendance(session)}
                    >
                      <ViewIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  if (loading && sessions.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">
          Quản lý Buổi học
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchTodaySessions}
          disabled={loading}
        >
          Làm mới
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Thống kê nhanh */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Tổng buổi hôm nay
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {sessions.length}
                  </Typography>
                </Box>
                <EventIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Đang diễn ra
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    {ongoingSessions.length}
                  </Typography>
                </Box>
                <CheckIcon sx={{ fontSize: 48, color: 'success.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography color="text.secondary" variant="body2">
                    Sắp diễn ra
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="info.main">
                    {upcomingSessions.length}
                  </Typography>
                </Box>
                <ScheduleIcon sx={{ fontSize: 48, color: 'info.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab
              label={
                <Badge badgeContent={upcomingSessions.length} color="primary">
                  Sắp diễn ra
                </Badge>
              }
            />
            <Tab
              label={
                <Badge badgeContent={ongoingSessions.length} color="success">
                  Đang diễn ra
                </Badge>
              }
            />
            <Tab
              label={
                <Badge badgeContent={completedSessions.length} color="default">
                  Đã kết thúc
                </Badge>
              }
            />
          </Tabs>
        </Box>

        <CardContent>
          <TabPanel value={tabValue} index={0}>
            <SessionTable sessions={upcomingSessions} />
          </TabPanel>
          <TabPanel value={tabValue} index={1}>
            <SessionTable sessions={ongoingSessions} />
          </TabPanel>
          <TabPanel value={tabValue} index={2}>
            <SessionTable sessions={completedSessions} />
          </TabPanel>
        </CardContent>
      </Card>

      {/* Dialog xem điểm danh */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedSession && (
            <Box>
              <Typography variant="h6">Danh sách điểm danh</Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedSession.ten_mon} - {selectedSession.giang_vien}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(selectedSession.ngay_hoc).toLocaleDateString('vi-VN')} |{' '}
                {selectedSession.gio_bat_dau}
              </Typography>
            </Box>
          )}
        </DialogTitle>
        <DialogContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : attendanceList.length === 0 ? (
            <Alert severity="info">Chưa có sinh viên nào điểm danh</Alert>
          ) : (
            <>
              <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
                <Chip
                  label={`Tổng: ${attendanceList.length}`}
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  label={`Đúng giờ: ${attendanceList.filter(a => a.trang_thai === 'Đúng giờ').length}`}
                  color="success"
                  variant="outlined"
                />
                <Chip
                  label={`Trễ: ${attendanceList.filter(a => a.trang_thai === 'Trễ').length}`}
                  color="warning"
                  variant="outlined"
                />
              </Box>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>STT</TableCell>
                      <TableCell>Mã SV</TableCell>
                      <TableCell>Họ tên</TableCell>
                      <TableCell>Lớp</TableCell>
                      <TableCell>Thời gian quét</TableCell>
                      <TableCell>Trạng thái</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {attendanceList.map((record, index) => (
                      <TableRow key={record.ma_diem_danh}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{record.ma_sv}</TableCell>
                        <TableCell>{record.ho_ten}</TableCell>
                        <TableCell>{record.lop}</TableCell>
                        <TableCell>
                          {new Date(record.thoi_gian_quet).toLocaleTimeString('vi-VN')}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={record.trang_thai}
                            color={record.trang_thai === 'Đúng giờ' ? 'success' : 'warning'}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Đóng</Button>
          <Button variant="contained" onClick={() => window.print()}>
            In danh sách
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// Missing import

export default SessionManagement;