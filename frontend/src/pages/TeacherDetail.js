import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Avatar,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  School as SchoolIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { teacherAPI } from '../services/api';
import { formatApiError } from '../utils/apiError';
import { useI18n } from '../i18n/I18nContext';

function TeacherDetail() {
  const { maGV } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adminForm, setAdminForm] = useState({
    ma_gv: '',
    ho_ten: '',
    email: '',
    dien_thoai: '',
    ma_khoa: '',
    trang_thai: 'Đang dạy',
  });
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMsg, setAdminMsg] = useState(null);
  const [adminErr, setAdminErr] = useState(null);

  useEffect(() => {
    fetchTeacher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maGV]);

  useEffect(() => {
    if (teacher) {
      setAdminForm({
        ma_gv: teacher.ma_gv || '',
        ho_ten: teacher.ho_ten || '',
        email: teacher.email || '',
        dien_thoai: teacher.dien_thoai || '',
        ma_khoa: teacher.ma_khoa || '',
        trang_thai: teacher.trang_thai || 'Đang dạy',
      });
    }
  }, [teacher]);

  const fetchTeacher = async () => {
    try {
      setLoading(true);
      const res = await teacherAPI.getById(maGV);
      setTeacher(res.data);
      setError(null);
    } catch (err) {
      setError(t('teacherDetailPage.loadFail'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setAdminErr(null);
    setAdminMsg(null);
    setAdminSaving(true);
    try {
      const res = await teacherAPI.update(teacher.ma_gv, adminForm);
      setAdminMsg(t('teacherDetailPage.updateMsg'));
      const newMa = res.data?.ma_gv || adminForm.ma_gv;
      if (String(newMa) !== String(maGV)) {
        navigate(`/teachers/${newMa}`, { replace: true });
      } else {
        await fetchTeacher();
      }
    } catch (err) {
      setAdminErr(formatApiError(err.response?.data?.detail, t('teacherDetailPage.saveFail')));
    } finally {
      setAdminSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('teacherDetailPage.deleteConfirm'))) return;
    setAdminSaving(true);
    try {
      await teacherAPI.delete(teacher.ma_gv);
      navigate('/teachers');
    } catch (err) {
      setAdminErr(formatApiError(err.response?.data?.detail, t('teacherDetailPage.deleteFail')));
      setAdminSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !teacher) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || t('teacherDetailPage.notFound')}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/teachers')}>
          {t('teacherDetailPage.backList')}
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/teachers')}
        variant="outlined"
        sx={{ mb: 3 }}
      >
        {t('teacherDetailPage.back')}
      </Button>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Card
            sx={{
              borderRadius: 3,
              overflow: 'hidden',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box
              sx={{
                px: 2.5,
                pt: 3,
                pb: 2.5,
                textAlign: 'center',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #8b5cf6 100%)',
              }}
            >
              <Avatar
                sx={{
                  width: 96,
                  height: 96,
                  margin: '0 auto 12px',
                  bgcolor: 'rgba(255,255,255,0.25)',
                  fontSize: 40,
                  fontWeight: 800,
                  border: '4px solid rgba(255,255,255,0.9)',
                }}
              >
                {teacher.ho_ten?.charAt(0) || 'G'}
              </Avatar>
              <Typography variant="h5" fontWeight={800} sx={{ color: '#fff' }}>
                {teacher.ho_ten}
              </Typography>
              <Chip
                label={teacher.trang_thai || t('teacherDetailPage.statusDefault')}
                size="small"
                sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.22)', color: '#fff' }}
              />
            </Box>

            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <PersonIcon sx={{ mr: 1, color: 'text.secondary' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {t('teacherDetailPage.fieldTeacherCode')}
                  </Typography>
                  <Typography fontWeight={600}>{teacher.ma_gv}</Typography>
                </Box>
              </Box>
              {teacher.email && (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <EmailIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('teacherDetailPage.fieldEmail')}
                    </Typography>
                    <Typography>{teacher.email}</Typography>
                  </Box>
                </Box>
              )}
              {teacher.dien_thoai && (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <PhoneIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('teacherDetailPage.fieldPhone')}
                    </Typography>
                    <Typography>{teacher.dien_thoai}</Typography>
                  </Box>
                </Box>
              )}
              {teacher.ma_khoa && (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <SchoolIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {t('teacherDetailPage.fieldFaculty')}
                    </Typography>
                    <Typography>{teacher.ma_khoa}</Typography>
                  </Box>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <EditIcon color="primary" fontSize="small" />
                <Typography variant="subtitle2" fontWeight={800} color="primary.main">
                  {t('teacherDetailPage.editTitle')}
                </Typography>
              </Box>
              {adminErr && <Alert severity="error" sx={{ mb: 1 }}>{adminErr}</Alert>}
              {adminMsg && <Alert severity="success" sx={{ mb: 1 }}>{adminMsg}</Alert>}

              <TextField
                label={t('teacherDetailPage.fieldTeacherCode')}
                fullWidth
                size="small"
                value={adminForm.ma_gv}
                onChange={(e) => setAdminForm((f) => ({ ...f, ma_gv: e.target.value }))}
                sx={{ mb: 1.5 }}
              />
              <TextField
                label={t('teacherDetailPage.fieldFullName')}
                fullWidth
                size="small"
                value={adminForm.ho_ten}
                onChange={(e) => setAdminForm((f) => ({ ...f, ho_ten: e.target.value }))}
                sx={{ mb: 1.5 }}
              />
              <TextField
                label={t('teacherDetailPage.fieldEmail')}
                fullWidth
                size="small"
                type="email"
                value={adminForm.email}
                onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
                sx={{ mb: 1.5 }}
              />
              <TextField
                label={t('teacherDetailPage.fieldPhone')}
                fullWidth
                size="small"
                value={adminForm.dien_thoai}
                onChange={(e) => setAdminForm((f) => ({ ...f, dien_thoai: e.target.value }))}
                sx={{ mb: 1.5 }}
              />
              <TextField
                label={t('teacherDetailPage.fieldFaculty')}
                fullWidth
                size="small"
                value={adminForm.ma_khoa}
                onChange={(e) => setAdminForm((f) => ({ ...f, ma_khoa: e.target.value }))}
                sx={{ mb: 1.5 }}
              />
              <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                <InputLabel>{t('teacherDetailPage.fieldStatus')}</InputLabel>
                <Select
                  label={t('teacherDetailPage.fieldStatus')}
                  value={adminForm.trang_thai}
                  onChange={(e) => setAdminForm((f) => ({ ...f, trang_thai: e.target.value }))}
                >
                  <MenuItem value="Đang dạy">{t('teacherList.statusTeaching')}</MenuItem>
                  <MenuItem value="Tạm nghỉ">{t('teacherList.statusPaused')}</MenuItem>
                  <MenuItem value="Đã nghỉ">{t('teacherList.statusRetired')}</MenuItem>
                </Select>
              </FormControl>
              <Button variant="contained" fullWidth disabled={adminSaving} onClick={handleSave} sx={{ mb: 1 }}>
                {adminSaving ? t('teacherDetailPage.saving') : t('teacherDetailPage.saveChanges')}
              </Button>
              <Button variant="outlined" color="error" fullWidth disabled={adminSaving} onClick={handleDelete}>
                {t('teacherDetailPage.deleteTeacher')}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={7}>
          <Card sx={{ p: 3, borderRadius: 3, minHeight: 320 }}>
            <Typography variant="h6" fontWeight={800} gutterBottom>
              {t('teacherDetailPage.infoTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('teacherDetailPage.infoHint')}
            </Typography>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default TeacherDetail;
