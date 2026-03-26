import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  TextField,
  Button,
  MenuItem,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import { studentPortalAPI } from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

const LOAI = [
  { value: 'CHUONG_TRINH', labelKey: 'studentFeedbackPage.types.curriculum' },
  { value: 'GIANG_VIEN', labelKey: 'studentFeedbackPage.types.teacher' },
  { value: 'GOP_Y', labelKey: 'studentFeedbackPage.types.general' },
];

export default function StudentFeedbackPage({ compact = false, maxItems = null }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [courses, setCourses] = useState([]);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const [loai, setLoai] = useState('GOP_Y');
  const [tieuDe, setTieuDe] = useState('');
  const [noiDung, setNoiDung] = useState('');
  const [maLhp, setMaLhp] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [enr, fb] = await Promise.all([
        studentPortalAPI.getMyEnrollments(),
        studentPortalAPI.listMyFeedbacks(),
      ]);
      setCourses(enr.data || []);
      setList(fb.data || []);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail, t('studentFeedbackPage.loadFail')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSend = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    setOk(null);
    try {
      await studentPortalAPI.submitFeedback({
        loai,
        tieu_de: tieuDe || null,
        noi_dung: noiDung,
        ma_lhp: maLhp || null,
      });
      setOk(t('studentFeedbackPage.okMessage'));
      setNoiDung('');
      setTieuDe('');
      await load();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, t('studentFeedbackPage.sendFail')));
    } finally {
      setSending(false);
    }
  };

  const listToShow = maxItems ? list.slice(0, maxItems) : list;

  return (
    <Box>
      {!compact && (
        <>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/student')} sx={{ mb: 2 }}>
            {t('studentFeedbackPage.back')}
          </Button>
          <Typography
            variant="h4"
            fontWeight={900}
            gutterBottom
            sx={{ background: 'linear-gradient(90deg,#7c3aed,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            {t('studentFeedbackPage.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('studentFeedbackPage.subtitle')}
          </Typography>
        </>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Card sx={{ p: 3, mb: 3, borderRadius: 3, boxShadow: '0 12px 40px rgba(124,58,237,0.15)' }}>
            <form onSubmit={onSend}>
              <Typography fontWeight={800} gutterBottom>{t('studentFeedbackPage.newTitle')}</Typography>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              {ok && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {ok}
                </Alert>
              )}
              <TextField
                select
                fullWidth
                label={t('studentFeedbackPage.typeLabel')}
                value={loai}
                onChange={(e) => setLoai(e.target.value)}
                sx={{ mb: 2 }}
              >
                {LOAI.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                label={t('studentFeedbackPage.relatedCourseLabel')}
                value={maLhp}
                onChange={(e) => setMaLhp(e.target.value)}
                sx={{ mb: 2 }}
                helperText={t('studentFeedbackPage.helperSelectCourse')}
              >
                <MenuItem value="">{t('studentFeedbackPage.noneOption')}</MenuItem>
                {courses.map((c) => (
                  <MenuItem key={c.ma_lhp} value={c.ma_lhp}>
                    {c.ma_lhp} — {c.ten_mon}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth
                label={t('studentFeedbackPage.titleField')}
                value={tieuDe}
                onChange={(e) => setTieuDe(e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                multiline
                minRows={4}
                label={t('studentFeedbackPage.contentField')}
                value={noiDung}
                onChange={(e) => setNoiDung(e.target.value)}
                required
                sx={{ mb: 2 }}
              />
              <Button type="submit" variant="contained" disabled={sending} startIcon={<SendIcon />} size="large">
                {sending ? t('studentFeedbackPage.sending') : t('studentFeedbackPage.sendButton')}
              </Button>
            </form>
          </Card>

          {!compact && (
            <Typography variant="h6" fontWeight={800} gutterBottom>
              {t('studentFeedbackPage.sentListTitle')}
            </Typography>
          )}
          {listToShow.map((f) => (
            <Card key={f.id} sx={{ mb: 1.5, p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                <Chip label={f.loai} size="small" color="primary" variant="outlined" />
                {f.ma_lhp && <Chip label={f.ma_lhp} size="small" />}
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  {f.created_at?.replace('T', ' ').slice(0, 19)}
                </Typography>
              </Box>
              {f.tieu_de && (
                <Typography fontWeight={700} gutterBottom>
                  {f.tieu_de}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                {f.noi_dung}
              </Typography>
            </Card>
          ))}
          {!listToShow.length && (
            <Typography color="text.secondary" variant="body2">
              {t('studentFeedbackPage.empty')}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
