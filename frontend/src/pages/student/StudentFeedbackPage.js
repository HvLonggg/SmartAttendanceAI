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

const LOAI = [
  { value: 'CHUONG_TRINH', label: 'Chương trình / nội dung môn học' },
  { value: 'GIANG_VIEN', label: 'Giảng viên' },
  { value: 'GOP_Y', label: 'Góp ý chung / khác' },
];

export default function StudentFeedbackPage() {
  const navigate = useNavigate();
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
      setError(e.response?.data?.detail || 'Không tải dữ liệu');
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
      setOk('Đã gửi phản hồi. Cảm ơn bạn!');
      setNoiDung('');
      setTieuDe('');
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Gửi thất bại');
    } finally {
      setSending(false);
    }
  };

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/student')} sx={{ mb: 2 }}>
        Về trang sinh viên
      </Button>
      <Typography variant="h4" fontWeight={900} gutterBottom sx={{ background: 'linear-gradient(90deg,#7c3aed,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Phản hồi & góp ý
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Ý kiến của bạn được lưu để nhà trường / quản trị xem xét (không hiển thị công khai).
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Card sx={{ p: 3, mb: 3, borderRadius: 3, boxShadow: '0 12px 40px rgba(124,58,237,0.15)' }}>
            <form onSubmit={onSend}>
              <Typography fontWeight={800} gutterBottom>
                Gửi phản hồi mới
              </Typography>
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
                label="Loại"
                value={loai}
                onChange={(e) => setLoai(e.target.value)}
                sx={{ mb: 2 }}
              >
                {LOAI.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                label="Môn liên quan (tuỳ chọn)"
                value={maLhp}
                onChange={(e) => setMaLhp(e.target.value)}
                sx={{ mb: 2 }}
                helperText="Chỉ chọn môn bạn đã đăng ký"
              >
                <MenuItem value="">— Không chọn —</MenuItem>
                {courses.map((c) => (
                  <MenuItem key={c.ma_lhp} value={c.ma_lhp}>
                    {c.ma_lhp} — {c.ten_mon}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth
                label="Tiêu đề (tuỳ chọn)"
                value={tieuDe}
                onChange={(e) => setTieuDe(e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                multiline
                minRows={4}
                label="Nội dung"
                value={noiDung}
                onChange={(e) => setNoiDung(e.target.value)}
                required
                sx={{ mb: 2 }}
              />
              <Button type="submit" variant="contained" disabled={sending} startIcon={<SendIcon />} size="large">
                {sending ? 'Đang gửi...' : 'Gửi phản hồi'}
              </Button>
            </form>
          </Card>

          <Typography variant="h6" fontWeight={800} gutterBottom>
            Phản hồi đã gửi
          </Typography>
          {list.map((f) => (
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
          {!list.length && (
            <Typography color="text.secondary" variant="body2">
              Chưa có phản hồi nào.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
