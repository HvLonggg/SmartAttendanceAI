import React, { useMemo, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Container,
  useTheme,
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
  AccountCircle as AccountCircleIcon,
  WorkHistory as WorkHistoryIcon,
  AssignmentInd as AssignmentIndIcon,
} from '@mui/icons-material';
import { useAuth } from '../../auth/AuthContext';
import AuthUserAvatar from '../AuthUserAvatar';
import { useI18n } from '../../i18n/I18nContext';

const drawerWidth = 260;

const adminMenuSpec = [
  { tKey: 'nav.dashboard', Icon: DashboardIcon, path: '/dashboard' },
  { tKey: 'nav.studentList', Icon: PeopleIcon, path: '/students' },
  { tKey: 'nav.sessionMgmt', Icon: CalendarIcon, path: '/sessions' },
  { tKey: 'nav.adminClassCreate', Icon: CalendarIcon, path: '/admin/classes' },
  { tKey: 'nav.adminTeaching', Icon: AssignmentIndIcon, path: '/admin/teaching' },
  { tKey: 'nav.analytics', Icon: AssessmentIcon, path: '/analytics' },
];

const teacherMenuSpec = [
  { tKey: 'nav.dashboard', Icon: DashboardIcon, path: '/dashboard' },
  {
    tKey: 'nav.teacherRegisterSession',
    Icon: CalendarIcon,
    path: '/teacher/sessions',
    match: (p) => p.startsWith('/teacher/sessions'),
  },
  { tKey: 'nav.studentList', Icon: PeopleIcon, path: '/students' },
  { tKey: 'nav.analytics', Icon: AssessmentIcon, path: '/analytics' },
  {
    tKey: 'nav.teacherCareer',
    Icon: WorkHistoryIcon,
    path: '/teacher/career',
    match: (p) => p.startsWith('/teacher/career'),
  },
  {
    tKey: 'nav.teacherProfile',
    Icon: AccountCircleIcon,
    path: '/teacher/profile',
    match: (p) => p === '/teacher/profile',
  },
];

const studentMenuSpec = [
  { tKey: 'nav.studentHome', Icon: HomeIcon, path: '/student', match: (p) => p === '/student' },
  {
    tKey: 'nav.studentAttendance',
    Icon: CameraIcon,
    path: '/student/attendance',
    match: (p) => p === '/student/attendance',
  },
  {
    tKey: 'nav.studentSessions',
    Icon: CalendarIcon,
    path: '/student/sessions',
    match: (p) => p === '/student/sessions',
  },
  {
    tKey: 'nav.studentCourses',
    Icon: MenuBookIcon,
    path: '/student/courses',
    match: (p) => p === '/student/courses',
  },
  {
    tKey: 'nav.studentProfile',
    Icon: PeopleIcon,
    path: '/student/profile',
    match: (p) => p === '/student/profile',
  },
  {
    tKey: 'nav.studentFeedback',
    Icon: RateReviewIcon,
    path: '/student/feedback',
    match: (p) => p === '/student/feedback',
  },
];

function MainLayout() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);

  const role = user?.role;
  const visibleMenuSpec = useMemo(() => {
    if (role === 'STUDENT') return studentMenuSpec;
    if (role === 'TEACHER') return teacherMenuSpec;
    return adminMenuSpec;
  }, [role]);

  const roleLabel = role ? t(`role.${role}`) || role : '';

  const dateLocale = locale === 'en' ? 'en-US' : 'vi-VN';

  const drawerPaperSx = isDark
    ? {
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        borderRight: '1px solid rgba(148,163,184,0.18)',
      }
    : {
        background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 45%, #e0e7ff 100%)',
        borderRight: '1px solid rgba(99,102,241,0.12)',
      };

  const iconDefault = isDark ? '#a5b4fc' : '#6366f1';
  const iconHover = isDark ? '#c4b5fd' : '#4f46e5';

  const userCardSx = isDark
    ? {
        background: 'rgba(129,140,248,0.12)',
        border: '1px solid rgba(129,140,248,0.28)',
        '&:hover': {
          background: 'rgba(129,140,248,0.2)',
          boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
        },
      }
    : {
        background: 'rgba(99,102,241,0.08)',
        border: '1px solid rgba(99,102,241,0.18)',
        '&:hover': {
          background: 'rgba(99,102,241,0.12)',
          boxShadow: '0 10px 28px rgba(99,102,241,0.18)',
        },
      };

  return (
    <Box sx={{ display: 'flex', width: '100%', bgcolor: 'background.default', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (th) => th.zIndex.drawer + 1,
          background: isDark
            ? 'linear-gradient(105deg, #312e81 0%, #5b21b6 55%, #831843 100%)'
            : 'linear-gradient(105deg, #2563eb 0%, #7c3aed 55%, #db2777 100%)',
          boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.45)' : '0 4px 24px rgba(37,99,235,0.25)',
          color: '#fff',
          transition: (th) =>
            th.transitions.create(['width', 'margin'], {
              easing: th.transitions.easing.sharp,
              duration: th.transitions.duration.leavingScreen,
            }),
        }}
      >
        <Toolbar sx={{ minHeight: 52 }}>
          <IconButton
            color="inherit"
            aria-label="toggle drawer"
            onClick={() => setOpen(!open)}
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
              textShadow: '0 1px 12px rgba(0,0,0,0.2)',
            }}
          >
            {t('layout.appTitle')}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.95, fontWeight: 500 }}>
            {new Date().toLocaleDateString(dateLocale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        open={open}
        sx={{
          width: open ? drawerWidth : 72,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: open ? drawerWidth : 72,
            boxSizing: 'border-box',
            ...drawerPaperSx,
            transition: (th) =>
              th.transitions.create('width', {
                easing: th.transitions.easing.sharp,
                duration: th.transitions.duration.enteringScreen,
              }),
            overflowX: 'hidden',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 1.5, px: 0.5 }}>
          <List sx={{ py: 0.5 }}>
            {visibleMenuSpec.map((item) => {
              const selected = item.match
                ? item.match(location.pathname)
                : item.path === '/students'
                  ? location.pathname.startsWith('/students')
                  : location.pathname === item.path;
              const Icon = item.Icon;
              return (
                <ListItem key={item.tKey} disablePadding sx={{ display: 'block', mb: 0.5 }}>
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
                        color: selected ? '#fff' : iconDefault,
                        minWidth: 40,
                        transition: 'color 0.2s ease, transform 0.2s ease',
                      },
                      '&:hover': {
                        bgcolor: isDark ? 'rgba(129,140,248,0.14)' : 'rgba(99,102,241,0.1)',
                        transform: 'translateX(4px)',
                        boxShadow: isDark ? '0 4px 14px rgba(0,0,0,0.35)' : '0 4px 14px rgba(99,102,241,0.15)',
                        '& .MuiListItemIcon-root': {
                          color: selected ? '#fff' : iconHover,
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
                      <Icon />
                    </ListItemIcon>
                    <ListItemText
                      primary={t(item.tKey)}
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
              transition: 'all 0.2s ease',
              transform: 'translateY(0)',
              '&:hover': {
                transform: 'translateY(-2px)',
              },
              ...userCardSx,
            }}
            onClick={(e) => setAnchorEl(e.currentTarget)}
          >
            <AuthUserAvatar sx={{ width: 38, height: 38 }} />
            <Box sx={{ minWidth: 0, flex: 1, opacity: open ? 1 : 0, transition: 'opacity 0.2s ease' }}>
              <Typography sx={{ fontWeight: 800, color: 'text.primary' }} noWrap>
                {user?.username || t('layout.account')}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {roleLabel}
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
              {t('layout.settings')}
            </MenuItem>
            {role === 'ADMIN' && (
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  navigate('/admin/users');
                }}
              >
                {t('layout.adminUsers')}
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
              {t('layout.logout')}
            </MenuItem>
          </Menu>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${open ? drawerWidth : 72}px)` },
          bgcolor: 'background.default',
          color: 'text.primary',
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
