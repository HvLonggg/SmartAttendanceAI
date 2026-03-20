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
        background:
          'radial-gradient(ellipse at top left, rgba(99,102,241,0.25), transparent 55%), radial-gradient(ellipse at bottom right, rgba(219,39,119,0.18), transparent 55%), #f5f5f5',
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

