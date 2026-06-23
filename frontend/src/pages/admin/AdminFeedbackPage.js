import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  Alert,
  CircularProgress,
  Chip,
  Avatar,
  Stack,
  Divider,
} from '@mui/material';
import RateReviewIcon from '@mui/icons-material/RateReview';
import { adminFeedbackAPI } from '../../services/api';
import { getStudentAvatarSrc, getStudentInitialLetter } from '../../utils/studentAvatar';
import { formatApiError } from '../../utils/apiError';
import { useI18n } from '../../i18n/I18nContext';

const LOAI_KEYS = {
  CHUONG_TRINH: 'adminFeedbackPage.types.curriculum',
  GIANG_VIEN: 'adminFeedbackPage.types.teacher',
  GOP_Y: 'adminFeedbackPage.types.general',
};

function FeedbackCard({ item, t, locale }) {
  const dateLocale = locale === 'en' ? 'en-US' : 'vi-VN';
  const st = item.student || {};
  const avatarSrc = st.anh_dai_dien ? getStudentAvatarSrc(st, 0) : null;
  const when = item.created_at
    ? new Date(item.created_at).toLocaleString(dateLocale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <Card
      sx={{
        p: { xs: 2, md: 2.5 },
        mb: 2,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: '0 8px 32px rgba(99,102,241,0.08)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 12px 40px rgba(99,102,241,0.14)',
        },
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
        <Avatar
          src={avatarSrc || undefined}
          sx={{
            width: 56,
            height: 56,
            fontWeight: 800,
            bgcolor: 'primary.main',
            boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
          }}
        >
          {!avatarSrc ? getStudentInitialLetter(st.ho_ten) : null}
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ sm: 'center' }}
            spacing={1}
            sx={{ mb: 1 }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={800}>
                {st.ho_ten || '—'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('adminFeedbackPage.studentId', { id: st.ma_sv || '—' })}
                {st.lop ? ` · ${st.lop}` : ''}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {when}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={t(LOAI_KEYS[item.loai] || LOAI_KEYS.GOP_Y)}
            />
            {item.ma_lhp && (
              <Chip size="small" variant="outlined" label={`LHP: ${item.ma_lhp}`} />
            )}
          </Stack>

          {item.tieu_de && (
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              {item.tieu_de}
            </Typography>
          )}
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
            {item.noi_dung}
          </Typography>
        </Box>
      </Stack>
    </Card>
  );
}

export default function AdminFeedbackPage() {
  const { t, locale } = useI18n();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminFeedbackAPI.listAll();
        setList(res.data || []);
      } catch (e) {
        setError(formatApiError(e.response?.data?.detail, t('adminFeedbackPage.loadFail')));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box sx={{ maxWidth: 920, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <RateReviewIcon color="primary" sx={{ fontSize: 36 }} />
        <Typography
          variant="h4"
          fontWeight={900}
          sx={{
            background: 'linear-gradient(90deg,#7c3aed,#6366f1)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {t('adminFeedbackPage.title')}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('adminFeedbackPage.subtitle')}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : list.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <RateReviewIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">{t('adminFeedbackPage.empty')}</Typography>
        </Card>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('adminFeedbackPage.count', { count: list.length })}
          </Typography>
          <Divider sx={{ mb: 2 }} />
          {list.map((item) => (
            <FeedbackCard key={item.id} item={item} t={t} locale={locale} />
          ))}
        </>
      )}
    </Box>
  );
}
