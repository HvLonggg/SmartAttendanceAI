import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { analyticsAPI, teacherAPI } from '../services/api';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';

function normalizeTrendRow(d) {
  const co = d.coMat ?? 0;
  const tr = d.tre ?? 0;
  return {
    name: d.name || '',
    tyLe: co + tr > 0 ? (100 * co) / (co + tr) : 0,
  };
}

function normalizeStatusForRadar(rows) {
  const raw = rows || [];
  const sum = raw.reduce((s, x) => s + (x.value || 0), 0);
  return raw.map((x) => ({
    subject: x.name || '—',
    value: sum ? Math.round((1000 * (x.value || 0)) / sum) / 10 : 0,
  }));
}

function AnalyticsReport() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'TEACHER';
  const { t, locale } = useI18n();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [behaviorData, setBehaviorData] = useState([]);
  const [comparisonData, setComparisonData] = useState([]);
  const [topStudents, setTopStudents] = useState([]);
  const [atRiskStudents, setAtRiskStudents] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.role || user.role === 'STUDENT') return;
      try {
        setLoading(true);
        setError(null);

        if (isTeacher) {
          const [ov, tr, st, top, risk, comp, rs] = await Promise.all([
            teacherAPI.getAnalyticsOverview(),
            teacherAPI.getAttendanceTrend(7),
            teacherAPI.getStatusDistribution(),
            teacherAPI.getTopStudents(5),
            teacherAPI.getAtRiskStudents(),
            teacherAPI.getClassComparison(),
            teacherAPI.getRecentSessionStats(14),
          ]);
          if (cancelled) return;
          setOverview(ov.data);
          setTrendData((tr.data || []).map(normalizeTrendRow));
          setBehaviorData(normalizeStatusForRadar(st.data));
          setComparisonData(comp.data || []);
          setTopStudents(top.data || []);
          setAtRiskStudents(risk.data || []);
          setRecentSessions(rs.data || []);
        } else {
          const [ov, tr, st, top, risk, comp, rs] = await Promise.all([
            analyticsAPI.getAnalyticsOverview(),
            analyticsAPI.getAttendanceTrend(7),
            analyticsAPI.getStatusDistribution(),
            analyticsAPI.getTopStudents(5),
            analyticsAPI.getAtRiskStudents(),
            analyticsAPI.getClassComparison(),
            analyticsAPI.getRecentSessionStats(14),
          ]);
          if (cancelled) return;
          setOverview(ov.data);
          setTrendData((tr.data || []).map(normalizeTrendRow));
          setBehaviorData(normalizeStatusForRadar(st.data));
          setComparisonData(comp.data || []);
          setTopStudents(top.data || []);
          setAtRiskStudents(risk.data || []);
          setRecentSessions(rs.data || []);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(t('analyticsReport.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.role, isTeacher]);

  const trendHint = useMemo(() => {
    if (trendData.length < 2) return null;
    const a = trendData[trendData.length - 2].tyLe;
    const b = trendData[trendData.length - 1].tyLe;
    const d = b - a;
    return { delta: d, up: d >= 0 };
  }, [trendData]);

  if (!user?.role || user.role === 'STUDENT') {
    return <Alert severity="info">{t('analyticsReport.noPermission')}</Alert>;
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">{t('analyticsReport.title')}</Typography>

      {isTeacher ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('analyticsReport.teacherNote')}
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('analyticsReport.adminNote')}
        </Alert>
      )}

      {/* Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" variant="body2">
                {t('analyticsReport.avgAttendance')}
              </Typography>
              <Typography variant="h3" color="primary">
                {(overview?.avg_attendance_rate ?? 0).toFixed(1)}%
              </Typography>
              {trendHint && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                  {trendHint.up ? (
                    <TrendingUpIcon color="success" fontSize="small" />
                  ) : (
                    <TrendingDownIcon color="error" fontSize="small" />
                  )}
                  <Typography
                    variant="body2"
                    color={trendHint.up ? 'success.main' : 'error'}
                    sx={{ ml: 0.5 }}
                  >
                    {trendHint.up ? '+' : ''}
                    {trendHint.delta.toFixed(1)} {t('analyticsReport.trendDeltaSuffix')}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" variant="body2">
                {isTeacher ? t('analyticsReport.eligibleTitleTeacher') : t('analyticsReport.eligibleTitleAdmin')}
              </Typography>
              <Typography variant="h3" color="success.main">
                {overview?.eligible_ratio_text ?? '—'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {(overview?.eligible_ok_percent ?? 0).toFixed(2)}% đủ điều kiện (ngưỡng 80%)
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" variant="body2">
                {t('analyticsReport.atRiskTitle')}
              </Typography>
              <Typography variant="h3" color="error.main">
                {overview?.at_risk_count ?? 0}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('analyticsReport.atRiskHint')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" variant="body2">
                {t('analyticsReport.lateRate7Days')}
              </Typography>
              <Typography variant="h3" color="warning.main">
                {(overview?.late_rate_week ?? 0).toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('analyticsReport.lateRateHint')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Biểu đồ xu hướng */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('analyticsReport.trendTitle')}</Typography>
              {trendData.length === 0 ? (
                <Typography color="text.secondary">{t('analyticsReport.trendNoData')}</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="tyLe"
                      stroke="#1976d2"
                      strokeWidth={3}
                      name={t('analyticsReport.table.chartRatio')}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('analyticsReport.statusDistTitle')}</Typography>
              {behaviorData.length === 0 ? (
                <Typography color="text.secondary">{t('analyticsReport.statusDistNoData')}</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={behaviorData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis domain={[0, 100]} />
                    <Radar
                      name={t('analyticsReport.table.radarWeight')}
                      dataKey="value"
                      stroke="#1976d2"
                      fill="#1976d2"
                      fillOpacity={0.6}
                    />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {t('analyticsReport.recentSessionsTitle')}
              </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {t('analyticsReport.recentSessionsHint')}
                </Typography>
                {recentSessions.length === 0 ? (
                  <Typography color="text.secondary">{t('analyticsReport.emptyRecentSessions')}</Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('analyticsReport.colBuoi')}</TableCell>
                          <TableCell>{t('analyticsReport.colMaLhp')}</TableCell>
                          <TableCell>{t('analyticsReport.colNgayGio')}</TableCell>
                          <TableCell align="right">{t('analyticsReport.colTongDk')}</TableCell>
                          <TableCell align="right">{t('analyticsReport.colDaQuet')}</TableCell>
                          <TableCell align="right">{t('analyticsReport.colDungTre')}</TableCell>
                          <TableCell align="right">{t('analyticsReport.colVangUoc')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {recentSessions.map((row) => (
                          <TableRow key={row.ma_buoi}>
                            <TableCell>{row.ma_buoi}</TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={600}>
                                {row.ten_mon || '—'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {row.ma_lhp}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {row.ngay_hoc
                                ? `${new Date(row.ngay_hoc).toLocaleDateString(
                                    locale === 'en' ? 'en-US' : 'vi-VN'
                                  )} ${(row.gio_bat_dau || '').toString().slice(0, 5)}`
                                : '—'}
                            </TableCell>
                            <TableCell align="right">{row.tong_sv_dang_ky ?? 0}</TableCell>
                            <TableCell align="right">{row.so_luot_quet ?? 0}</TableCell>
                            <TableCell align="right">
                              {row.dung_gio ?? 0} / {row.tre ?? 0}
                            </TableCell>
                            <TableCell align="right">{row.vang_uoc ?? 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

      {/* So sánh lớp */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{t('analyticsReport.compareTitle')}</Typography>
              {comparisonData.length === 0 ? (
                <Typography color="text.secondary">{t('analyticsReport.compareNoData')}</Typography>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="lop" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="tyLe" fill="#2e7d32" name={t('analyticsReport.table.chartEligible')} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Bảng sinh viên */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>🏆 {t('analyticsReport.topTitle')}</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('analyticsReport.table.index')}</TableCell>
                      <TableCell>{t('analyticsReport.table.studentCode')}</TableCell>
                      <TableCell>{t('analyticsReport.table.studentName')}</TableCell>
                      <TableCell align="right">{t('analyticsReport.table.ratio')}</TableCell>
                      {isTeacher && <TableCell>{t('analyticsReport.topHabitCol')}</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topStudents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isTeacher ? 5 : 4}>
                          <Typography color="text.secondary">{t('analyticsReport.emptyTop')}</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      topStudents.map((student, index) => (
                        <TableRow key={student.ma_sv}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{student.ma_sv}</TableCell>
                          <TableCell>{student.ho_ten}</TableCell>
                          <TableCell align="right">
                            <Chip
                              label={`${Number(student.ty_le).toFixed(1)}%`}
                              color="success"
                              size="small"
                            />
                          </TableCell>
                          {isTeacher && (
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {student.ghi_chu_thoi_quen || '—'}
                              </Typography>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>⚠️ {t('analyticsReport.atRiskCareTitle')}</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('analyticsReport.table.studentCode')}</TableCell>
                      <TableCell>{t('analyticsReport.table.studentName')}</TableCell>
                      <TableCell align="right">{t('analyticsReport.table.ratio')}</TableCell>
                      <TableCell>{t('analyticsReport.table.warning')}</TableCell>
                      {isTeacher && <TableCell>{t('analyticsReport.riskHabitCol')}</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {atRiskStudents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isTeacher ? 5 : 4}>
                          <Typography color="text.secondary">{t('analyticsReport.emptyAtRisk')}</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      atRiskStudents.map((student) => (
                        <TableRow key={student.ma_sv}>
                          <TableCell>{student.ma_sv}</TableCell>
                          <TableCell>{student.ho_ten}</TableCell>
                          <TableCell align="right">
                            <Chip
                              label={`${Number(student.ty_le).toFixed(1)}%`}
                              color="error"
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={student.ket_luan}
                              color="warning"
                              size="small"
                              icon={<WarningIcon />}
                            />
                          </TableCell>
                          {isTeacher && (
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {student.thoi_quen_hoc_tap || '—'}
                              </Typography>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tóm tắt */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>{t('analyticsReport.quickSummary')}</Typography>
          {(overview?.tracked_students ?? 0) > 0 || (overview?.at_risk_count ?? 0) > 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                {t('analyticsReport.quickSummaryHint', {
                  avg: (overview?.avg_attendance_rate ?? 0).toFixed(1),
                  riskCount: overview?.at_risk_count ?? 0,
                })}
              </Typography>
            </Alert>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('analyticsReport.quickSummaryNoData')}
            </Typography>
          )}
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t('analyticsReport.lateRateCaption')}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, overview?.late_rate_week ?? 0)}
              color={(overview?.late_rate_week ?? 0) > 20 ? 'error' : 'warning'}
              sx={{ height: 8, borderRadius: 4, mt: 0.5 }}
            />
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default AnalyticsReport;
