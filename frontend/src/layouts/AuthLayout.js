import React from 'react';
import { Box } from '@mui/material';

export default function AuthLayout({ children }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        bgcolor: '#ffffff',
        color: 'text.primary',
        backgroundImage:
          'radial-gradient(ellipse at top left, rgba(99,102,241,0.12), transparent 55%), radial-gradient(ellipse at bottom right, rgba(219,39,119,0.1), transparent 55%)',
        p: 2,
      }}
    >
      {/* Không dùng width:100% ở đây — nếu không flex sẽ kéo full màn hình và không căn giữa */}
      <Box
        sx={{
          width: 'min(560px, calc(100vw - 32px))',
          maxWidth: '100%',
          flexShrink: 0,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

