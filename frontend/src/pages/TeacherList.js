import React, { useEffect, useState } from 'react';
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
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Alert,
  MenuItem,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { teacherAPI } from '../services/api';
import { formatApiError } from '../utils/apiError';
import { useI18n } from '../i18n/I18nContext';

function TeacherList() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [teachers, setTeachers] = useState([]);
  const [filteredTeachers, setFilteredTeachers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    ma_gv: '',
    ho_ten: '',
    email: '',
    dien_thoai: '',
    ma_khoa: '',
    trang_thai: 'Đang dạy',
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetchTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = searchTerm.trim().toLowerCase();
    const filtered = teachers.filter(
      (g) =>
        (g.ho_ten || '').toLowerCase().includes(q) ||
        (g.ma_gv || '').toLowerCase().includes(q) ||
        (g.ma_khoa || '').toLowerCase().includes(q)
    );
    setFilteredTeachers(filtered);
    setPage(0);
  }, [searchTerm, teachers]);

  const fetchTeachers = async () => {
    try {
      const response = await teacherAPI.getAll();
      setTeachers(response.data || []);
      setFilteredTeachers(response.data || []);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, t('teacherList.fetchFail')));
    }
  };

  const handleOpenDialog = () => {
    setFormData({
      ma_gv: '',
      ho_ten: '',
      email: '',
      dien_thoai: '',
      ma_khoa: '',
      trang_thai: 'Đang dạy',
    });
    setOpenDialog(true);
  };

  const handleSubmit = async () => {
    try {
      await teacherAPI.create(formData);
      setSuccess(t('teacherList.addSuccess'));
      setOpenDialog(false);
      fetchTeachers();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, t('teacherList.addFail')));
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">
          {t('teacherList.title')}
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenDialog}>
          {t('teacherList.addTeacher')}
        </Button>
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
            placeholder={t('teacherList.searchPlaceholder')}
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
                  <TableCell>{t('teacherList.table.teacherCode')}</TableCell>
                  <TableCell>{t('teacherList.table.fullName')}</TableCell>
                  <TableCell>{t('teacherList.table.email')}</TableCell>
                  <TableCell>{t('teacherList.table.phone')}</TableCell>
                  <TableCell>{t('teacherList.table.faculty')}</TableCell>
                  <TableCell>{t('teacherList.table.status')}</TableCell>
                  <TableCell align="right">{t('teacherList.table.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTeachers
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((g) => (
                    <TableRow key={g.ma_gv} hover>
                      <TableCell>{g.ma_gv}</TableCell>
                      <TableCell>
                        <Typography
                          fontWeight={600}
                          sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
                          onClick={() => navigate(`/teachers/${g.ma_gv}`)}
                        >
                          {g.ho_ten}
                        </Typography>
                      </TableCell>
                      <TableCell>{g.email || '—'}</TableCell>
                      <TableCell>{g.dien_thoai || '—'}</TableCell>
                      <TableCell>{g.ma_khoa || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          label={g.trang_thai || t('teacherList.statusDefault')}
                          size="small"
                          color={g.trang_thai === 'Đang dạy' ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => navigate(`/teachers/${g.ma_gv}`)}
                          title={t('teacherList.viewDetail')}
                        >
                          <ViewIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                {filteredTeachers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      {t('teacherList.empty')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filteredTeachers.length}
            page={page}
            onPageChange={(e, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            labelRowsPerPage={t('teacherList.rowsPerPage')}
          />
        </CardContent>
      </Card>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('teacherList.dialogTitle')}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('teacherList.table.teacherCode')}
                name="ma_gv"
                fullWidth
                required
                value={formData.ma_gv}
                onChange={(e) => setFormData({ ...formData, ma_gv: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('teacherList.table.fullName')}
                name="ho_ten"
                fullWidth
                required
                value={formData.ho_ten}
                onChange={(e) => setFormData({ ...formData, ho_ten: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('teacherList.table.email')}
                name="email"
                fullWidth
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('teacherList.table.phone')}
                name="dien_thoai"
                fullWidth
                value={formData.dien_thoai}
                onChange={(e) => setFormData({ ...formData, dien_thoai: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('teacherList.table.faculty')}
                name="ma_khoa"
                fullWidth
                value={formData.ma_khoa}
                onChange={(e) => setFormData({ ...formData, ma_khoa: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                label={t('teacherList.table.status')}
                fullWidth
                value={formData.trang_thai}
                onChange={(e) => setFormData({ ...formData, trang_thai: e.target.value })}
              >
                <MenuItem value="Đang dạy">{t('teacherList.statusTeaching')}</MenuItem>
                <MenuItem value="Tạm nghỉ">{t('teacherList.statusPaused')}</MenuItem>
                <MenuItem value="Đã nghỉ">{t('teacherList.statusRetired')}</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSubmit}>
            {t('teacherList.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default TeacherList;
