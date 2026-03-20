import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Container,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  CameraAlt as CameraIcon,
  People as PeopleIcon,
  CalendarToday as CalendarIcon,
  Assessment as AssessmentIcon,
  ChevronLeft as ChevronLeftIcon,
  Home as HomeIcon,
  MenuBook as MenuBookIcon,
  RateReview as RateReviewIcon,
} from '@mui/icons-material';
import { useAuth } from '../../auth/AuthContext';
import { getApiPathPrefix } from '../../config/apiBase';

const drawerWidth = 260;

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'Điểm danh Camera', icon: <CameraIcon />, path: '/attendance' },
  { text: 'Danh sách Sinh viên', icon: <PeopleIcon />, path: '/students' },
  { text: 'Quản lý Buổi học', icon: <CalendarIcon />, path: '/sessions' },
  { text: 'Báo cáo Phân tích', icon: <AssessmentIcon />, path: '/analytics' },
];

/** Menu riêng sinh viên — match(pathname) để highlight đúng */
const studentMenuItems = [
  { text: 'Trang sinh viên', icon: <HomeIcon />, path: '/student', match: (p) => p === '/student' },
  { text: 'Buổi học', icon: <CalendarIcon />, path: '/student/sessions', match: (p) => p === '/student/sessions' },
  { text: 'Môn đăng ký', icon: <MenuBookIcon />, path: '/student/courses', match: (p) => p === '/student/courses' },
  { text: 'Hồ sơ của tôi', icon: <PeopleIcon />, path: '/student/profile', match: (p) => p.startsWith('/students/') },
  { text: 'Phản hồi & góp ý', icon: <RateReviewIcon />, path: '/student/feedback', match: (p) => p === '/student/feedback' },
  { text: 'Điểm danh Camera', icon: <CameraIcon />, path: '/attendance', match: (p) => p === '/attendance' },
];

function MainLayout() {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);

  const role = user?.role;
  const visibleMenuItems =
    role === 'STUDENT'
      ? studentMenuItems
      : role
        ? menuItems.filter((item) => {
            if (item.path === '/students') return role === 'TEACHER' || role === 'ADMIN';
            if (item.path === '/sessions') return role === 'TEACHER' || role === 'ADMIN';
            if (item.path === '/analytics') return role === 'ADMIN' || role === 'TEACHER';
            return true;
          })
        : menuItems;

  const toggleDrawer = () => {
    setOpen(!open);
  };

  return (
    <Box sx={{ display: 'flex', width: '100%' }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          background: 'linear-gradient(105deg, #2563eb 0%, #7c3aed 55%, #db2777 100%)',
          boxShadow: '0 4px 24px rgba(37,99,235,0.25)',
          transition: (theme) =>
            theme.transitions.create(['width', 'margin'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
        }}
      >
        <Toolbar sx={{ minHeight: 52 }}>
          <IconButton
            color="inherit"
            aria-label="toggle drawer"
            onClick={toggleDrawer}
            edge="start"
            sx={{
              marginRight: 2,
              transition: 'transform 0.2s ease, background-color 0.2s ease',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.12)',
                transform: 'scale(1.06)',
              },
            }}
          >
            {open ? <ChevronLeftIcon /> : <MenuIcon />}
          </IconButton>
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{
              flexGrow: 1,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              textShadow: '0 1px 12px rgba(0,0,0,0.12)',
            }}
          >
            Smart Attendance AI
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.95, fontWeight: 500 }}>
            {new Date().toLocaleDateString('vi-VN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Drawer */}
      <Drawer
        variant="permanent"
        open={open}
        sx={{
          width: open ? drawerWidth : 72,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: open ? drawerWidth : 72,
            boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 45%, #e0e7ff 100%)',
            borderRight: '1px solid rgba(99,102,241,0.12)',
            transition: (theme) =>
              theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
            overflowX: 'hidden',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 1.5, px: 0.5 }}>
          <List sx={{ py: 0.5 }}>
            {visibleMenuItems.map((item) => {
              const selected = item.match
                ? item.match(location.pathname)
                : item.path === '/students'
                  ? location.pathname.startsWith('/students')
                  : location.pathname === item.path;
              return (
              <ListItem key={item.text} disablePadding sx={{ display: 'block', mb: 0.5 }}>
                <ListItemButton
                  selected={selected}
                  onClick={() => navigate(item.path)}
                  sx={{
                    minHeight: 44,
                    justifyContent: open ? 'initial' : 'center',
                    px: 2,
                    mx: 0.75,
                    borderRadius: 2,
                    transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                    color: 'text.primary',
                    '& .MuiListItemIcon-root': {
                      color: selected ? '#fff' : '#6366f1',
                      minWidth: 40,
                      transition: 'color 0.2s ease, transform 0.2s ease',
                    },
                    '&:hover': {
                      bgcolor: 'rgba(99,102,241,0.1)',
                      transform: 'translateX(4px)',
                      boxShadow: '0 4px 14px rgba(99,102,241,0.15)',
                      '& .MuiListItemIcon-root': {
                        color: '#4f46e5',
                        transform: 'scale(1.08)',
                      },
                    },
                    '&.Mui-selected': {
                      background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
                      color: '#fff',
                      boxShadow: '0 6px 20px rgba(99,102,241,0.35)',
                      '&:hover': {
                        background: 'linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%)',
                        transform: 'translateX(4px)',
                      },
                      '& .MuiListItemIcon-root': {
                        color: '#fff',
                      },
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: open ? 2 : 'auto',
                      justifyContent: 'center',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{
                      fontWeight: selected ? 700 : 600,
                      fontSize: '0.8125rem',
                    }}
                    sx={{ opacity: open ? 1 : 0 }}
                  />
                </ListItemButton>
              </ListItem>
              );
            })}
          </List>
        </Box>

        {/* User section */}
        <Box
          sx={{
            position: 'sticky',
            bottom: 12,
            px: 1,
            pb: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              borderRadius: 2,
              py: 1,
              px: 1,
              mx: 0.5,
              cursor: 'pointer',
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.18)',
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 10px 28px rgba(99,102,241,0.18)',
                background: 'rgba(99,102,241,0.12)',
              },
            }}
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            <Avatar
              src={
                user?.avatar && user?.username
                  ? `${getApiPathPrefix()}/auth/avatar/${user.username}`
                  : undefined
              }
              sx={{
                width: 38,
                height: 38,
                bgcolor: 'primary.main',
                fontWeight: 800,
              }}
            >
              {!user?.avatar && user?.username ? user.username.charAt(0) : null}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1, opacity: open ? 1 : 0, transition: 'opacity 0.2s ease' }}>
              <Typography sx={{ fontWeight: 800 }} noWrap>
                {user?.username || 'Tài khoản'}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {role || ''}
              </Typography>
            </Box>
          </Box>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                navigate('/settings');
              }}
            >
              Cài đặt
            </MenuItem>
            {role === 'ADMIN' && (
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  navigate('/admin/users');
                }}
              >
                Quản lý tài khoản
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                logout();
                navigate('/auth/login');
              }}
              sx={{ color: 'error.main' }}
            >
              Logout
            </MenuItem>
          </Menu>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${open ? drawerWidth : 72}px)` },
        }}
      >
        <Toolbar />
        <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}

export default MainLayout;