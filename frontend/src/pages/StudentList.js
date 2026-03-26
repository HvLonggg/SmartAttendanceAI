import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  TablePagination,
  TextField,
  InputAdornment,
  IconButton,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Alert,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Visibility as ViewIcon,
  Camera as CameraIcon,
} from '@mui/icons-material';
import { studentAPI, teacherAPI } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { getStudentAvatarSrc } from '../utils/studentAvatar';
import { formatApiError } from '../utils/apiError';
import { useI18n } from '../i18n/I18nContext';

function StudentList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const dateLocale = locale === 'en' ? 'en-US' : 'vi-VN';
  const isTeacher = user?.role === 'TEACHER';
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    ma_sv: '',
    ho_ten: '',
    ngay_sinh: '',
    gioi_tinh: 'Nam',
    lop: '',
    khoa: '',
    email: '',
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!user?.role) return;
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  useEffect(() => {
    const filtered = students.filter(student =>
      student.ho_ten.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.ma_sv.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.lop?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredStudents(filtered);
    setPage(0);
  }, [searchTerm, students]);

  const fetchStudents = async () => {
    try {
      if (isTeacher) {
        const response = await teacherAPI.getMyStudents();
        setStudents(response.data);
        setFilteredStudents(response.data);
      } else {
        const response = await studentAPI.getAll();
        setStudents(response.data);
        setFilteredStudents(response.data);
      }
    } catch (err) {
      console.error('Error fetching students:', err);
      setError(t('studentList.fetchFail'));
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleOpenDialog = () => {
    setFormData({
      ma_sv: '',
      ho_ten: '',
      ngay_sinh: '',
      gioi_tinh: 'Nam',
      lop: '',
      khoa: '',
      email: '',
    });
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setError(null);
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async () => {
    try {
      await studentAPI.create(formData);
      setSuccess(t('studentList.addSuccess'));
      setOpenDialog(false);
      fetchStudents();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, t('studentList.addFail')));
    }
  };

  const handleViewStudent = (maSV) => {
    navigate(`/students/${maSV}`);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold">{t('studentList.title')}</Typography>
          {isTeacher && (
            <Typography variant="body2" color="text.secondary">
              {t('studentList.subtitleTeacher')}
            </Typography>
          )}
        </Box>
        {!isTeacher && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleOpenDialog}
          >
            {t('studentList.addStudent')}
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Card>
        <CardContent>
          <TextField
            fullWidth
            placeholder={t('studentList.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 3 }}
          />

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('studentList.table.studentCode')}</TableCell>
                  <TableCell>{t('studentList.table.fullName')}</TableCell>
                  <TableCell>{t('studentList.table.birthDate')}</TableCell>
                  <TableCell>{t('studentList.table.gender')}</TableCell>
                  <TableCell>{t('studentList.table.className')}</TableCell>
                  <TableCell>{t('studentList.table.faculty')}</TableCell>
                  <TableCell>{t('studentList.table.status')}</TableCell>
                  <TableCell align="right">{t('studentList.table.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredStudents
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((student) => (
                    <TableRow key={student.ma_sv} hover>
                      <TableCell>{student.ma_sv}</TableCell>
                      <TableCell>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.25,
                            cursor: 'pointer',
                            py: 0.25,
                            '&:hover .stu-name': { color: 'primary.main' },
                          }}
                          onClick={() => handleViewStudent(student.ma_sv)}
                        >
                          <Avatar
                            src={
                              student.anh_dai_dien
                                ? getStudentAvatarSrc(student, 0)
                                : undefined
                            }
                            sx={{
                              width: 38,
                              height: 38,
                              fontSize: 15,
                              fontWeight: 700,
                              bgcolor: 'primary.main',
                              boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
                            }}
                          >
                            {(!student.anh_dai_dien && student.ho_ten?.charAt(0)) || ''}
                          </Avatar>
                          <Typography
                            className="stu-name"
                            fontWeight={600}
                            noWrap
                            title={student.ho_ten}
                            sx={{ transition: 'color 0.2s ease' }}
                          >
                            {student.ho_ten}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        {student.ngay_sinh
                          ? new Date(student.ngay_sinh).toLocaleDateString(dateLocale)
                          : '-'}
                      </TableCell>
                      <TableCell>{student.gioi_tinh || '-'}</TableCell>
                      <TableCell>{student.lop || '-'}</TableCell>
                      <TableCell>{student.khoa || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          label={student.trang_thai || t('studentList.statusDefault')}
                          color={student.trang_thai === 'Đang học' ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleViewStudent(student.ma_sv)}
                          title={t('studentList.viewDetail')}
                        >
                          <ViewIcon />
                        </IconButton>
                        {!isTeacher && (
                          <IconButton
                            size="small"
                            color="secondary"
                            onClick={() => navigate(`/students/${student.ma_sv}/training`)}
                            title={t('studentList.trainingRecognition')}
                          >
                            <CameraIcon />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filteredStudents.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage={locale === 'en' ? 'Rows per page:' : 'Số dòng mỗi trang:'}
            labelDisplayedRows={({ from, to, count }) =>
              locale === 'en' ? `${from}–${to} of ${count}` : `${from}–${to} của ${count}`
            }
          />
        </CardContent>
      </Card>

      {/* Dialog thêm sinh viên */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{t('studentList.dialog.title')}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('studentList.dialog.studentCode')}
                name="ma_sv"
                value={formData.ma_sv}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('studentList.dialog.fullName')}
                name="ho_ten"
                value={formData.ho_ten}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('studentList.dialog.birthDate')}
                name="ngay_sinh"
                type="date"
                value={formData.ngay_sinh}
                onChange={handleInputChange}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label={t('studentList.dialog.gender')}
                name="gioi_tinh"
                value={formData.gioi_tinh}
                onChange={handleInputChange}
                SelectProps={{ native: true }}
              >
                <option value="Nam">{t('studentList.dialog.genderMale')}</option>
                <option value="Nữ">{t('studentList.dialog.genderFemale')}</option>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('studentList.dialog.className')}
                name="lop"
                value={formData.lop}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('studentList.dialog.faculty')}
                name="khoa"
                value={formData.khoa}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('studentList.dialog.email')}
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t('studentList.dialog.cancel')}</Button>
          <Button onClick={handleSubmit} variant="contained" color="primary">
            {t('studentList.dialog.confirmAdd')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StudentList;