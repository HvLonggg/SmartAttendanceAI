import React from 'react';
import { Box, Button, Fade, Paper, Typography } from '@mui/material';

/** Thông báo nổi giữa vùng camera — dùng chung cho mọi màn hình nhận diện / điểm danh. */
export default function CameraNoticeOverlay({
  open,
  variant = 'info',
  icon,
  title,
  message,
  actionLabel,
  onDismiss,
}) {
  if (!open) return null;

  const border =
    variant === 'success'
      ? 'linear-gradient(135deg, rgba(16,185,129,0.95), rgba(5,150,105,0.92))'
      : variant === 'warning'
        ? 'linear-gradient(135deg, rgba(245,158,11,0.95), rgba(217,119,6,0.92))'
        : 'linear-gradient(135deg, rgba(99,102,241,0.95), rgba(79,70,229,0.92))';

  return (
    <Fade in={open}>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 1,
          pointerEvents: 'none',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            pointerEvents: 'auto',
            maxWidth: 860,
            width: { xs: '98%', md: '96%' },
            p: { xs: 2.35, sm: 2.7, md: 3 },
            borderRadius: 3,
            textAlign: 'center',
            background: border,
            color: '#fff',
            boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
            border: '1px solid rgba(255,255,255,0.22)',
          }}
        >
          {icon ? (
            <Box
              sx={{
                width: { xs: 58, sm: 62 },
                height: { xs: 58, sm: 62 },
                borderRadius: '50%',
                bgcolor: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 1.25,
                '& .MuiSvgIcon-root': { fontSize: { xs: 30, sm: 32 } },
              }}
            >
              {icon}
            </Box>
          ) : null}
          <Typography
            variant="h6"
            component="div"
            fontWeight={800}
            gutterBottom
            sx={{ letterSpacing: 0.15, fontSize: { xs: '1.02rem', sm: '1.1rem' }, lineHeight: 1.32 }}
          >
            {title}
          </Typography>
          <Typography
            variant="body2"
            sx={{ opacity: 0.96, lineHeight: 1.55, mb: 2.25, fontSize: { xs: '0.84rem', sm: '0.9rem' } }}
          >
            {message}
          </Typography>
          {actionLabel && onDismiss ? (
            <Button
              variant="contained"
              size="large"
              onClick={onDismiss}
              sx={{
                bgcolor: 'rgba(255,255,255,0.98)',
                color: variant === 'success' ? 'success.dark' : 'primary.dark',
                fontWeight: 800,
                px: 3,
                py: 1,
                fontSize: '0.92rem',
                '&:hover': { bgcolor: '#fff' },
              }}
            >
              {actionLabel}
            </Button>
          ) : null}
        </Paper>
      </Box>
    </Fade>
  );
}
