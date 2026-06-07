import React from 'react';
import { Box, Typography, Stack, useTheme, useMediaQuery } from '@mui/material';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import ScheduleIcon from '@mui/icons-material/Schedule';

const FEATURES = [
  { icon: FaceRetouchingNaturalIcon, text: 'Nhận diện khuôn mặt thông minh' },
  { icon: ScheduleIcon, text: 'Điểm danh tự động theo buổi học' },
  { icon: AnalyticsIcon, text: 'Báo cáo chuyên cần theo thời gian thực' },
  { icon: VerifiedUserIcon, text: 'Bảo mật & phân quyền theo vai trò' },
];

export default function AuthLayout({ children, wide = false }) {
  const theme = useTheme();
  const isLaptop = useMediaQuery(theme.breakpoints.up('md'));

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        boxSizing: 'border-box',
        bgcolor: theme.palette.background.default,
      }}
    >
      {isLaptop && (
        <Box
          sx={{
            flex: '0 0 44%',
            maxWidth: 560,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            px: 6,
            py: 5,
            background: 'linear-gradient(145deg, #312e81 0%, #4f46e5 42%, #7c3aed 78%, #db2777 100%)',
            color: '#fff',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: -80,
              right: -80,
              width: 280,
              height: 280,
              borderRadius: '50%',
              bgcolor: 'rgba(255,255,255,0.08)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              bottom: -60,
              left: -40,
              width: 200,
              height: 200,
              borderRadius: '50%',
              bgcolor: 'rgba(255,255,255,0.06)',
            }}
          />

          <Box sx={{ position: 'relative', zIndex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  borderRadius: 3,
                  bgcolor: 'rgba(255,255,255,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <FaceRetouchingNaturalIcon sx={{ fontSize: 30 }} />
              </Box>
              <Box>
                <Typography variant="h5" fontWeight={800} lineHeight={1.2}>
                  SmartAttendance AI
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.85 }}>
                  Hệ thống điểm danh thông minh
                </Typography>
              </Box>
            </Box>

            <Typography variant="h4" fontWeight={800} sx={{ mb: 1.5, lineHeight: 1.25 }}>
              Quản lý chuyên cần
              <br />
              chính xác & minh bạch
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, mb: 4, maxWidth: 380, lineHeight: 1.7 }}>
              Nền tảng điểm danh bằng AI dành cho sinh viên, giảng viên và quản trị viên — theo dõi
              buổi học, cảnh báo nguy cơ và báo cáo tự động.
            </Typography>

            <Stack spacing={2}>
              {FEATURES.map(({ icon: Icon, text }) => (
                <Box key={text} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ fontSize: 20 }} />
                  </Box>
                  <Typography variant="body2" fontWeight={500} sx={{ opacity: 0.95 }}>
                    {text}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>
      )}

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 2, sm: 3, md: 4 },
          py: { xs: 3, md: 4 },
          backgroundImage: isLaptop
            ? 'none'
            : 'radial-gradient(ellipse at top left, rgba(99,102,241,0.1), transparent 55%), radial-gradient(ellipse at bottom right, rgba(219,39,119,0.08), transparent 55%)',
        }}
      >
        {!isLaptop && (
          <Box sx={{ textAlign: 'center', mb: 2.5 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2.5,
                bgcolor: 'primary.main',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 1,
                boxShadow: '0 8px 24px rgba(79,70,229,0.35)',
              }}
            >
              <FaceRetouchingNaturalIcon />
            </Box>
            <Typography variant="h6" fontWeight={800} color="primary.main">
              SmartAttendance AI
            </Typography>
          </Box>
        )}

        <Box
          sx={{
            width: '100%',
            maxWidth: wide ? 520 : 440,
            flexShrink: 0,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
