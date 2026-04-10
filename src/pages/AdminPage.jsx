import React, { useCallback, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AdminPanelSettings as AdminIcon,
  Group as GroupIcon,
  MonetizationOn as RevenueIcon,
  PendingActions as PendingIcon,
  Person as UserIcon,
  VerifiedUser as ActiveIcon,
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';
const ADMIN_TOKEN_KEY = 'autozalo_admin_token';

const PLAN_LABELS = { basic: 'Basic', plus: 'Plus', pro: 'Pro' };
const PLAN_COLORS = { basic: 'info', plus: 'primary', pro: 'secondary' };
const STATUS_COLORS = { active: 'success', expired: 'error', free: 'default', pending: 'warning', paid: 'success', cancelled: 'default' };
const STATUS_LABELS = { active: 'Đang dùng', expired: 'Hết hạn', free: 'Miễn phí', pending: 'Chờ thanh toán', paid: 'Đã thanh toán', cancelled: 'Đã huỷ' };

function fmtMoney(n) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n || 0);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatCard({ icon, label, value, color = 'primary', sub }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 140 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box sx={{ color: `${color}.main` }}>{icon}</Box>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Box>
        <Typography variant="h5" fontWeight={800} color={`${color}.main`}>{value}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState(() => sessionStorage.getItem(ADMIN_TOKEN_KEY) || '');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [orders, setOrders] = useState(null);
  const [tab, setTab] = useState(0);

  const adminFetch = useCallback(
    async (path, currentToken = token) => {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (res.status === 401) throw new Error('Phiên đã hết hạn, vui lòng đăng nhập lại.');
      if (!res.ok) throw new Error('Lỗi server.');
      return res.json();
    },
    [token],
  );

  const loadDashboard = useCallback(
    async (currentToken = token) => {
      const [sData, uData, oData] = await Promise.all([
        adminFetch('/api/admin/stats', currentToken),
        adminFetch('/api/admin/users', currentToken),
        adminFetch('/api/admin/orders', currentToken),
      ]);

      setStats(sData.stats);
      setUsers(uData.users);
      setOrders(oData.orders);
      setAuthenticated(true);
    },
    [adminFetch, token],
  );

  React.useEffect(() => {
    if (!token || authenticated) return;

    let active = true;
    setLoading(true);
    loadDashboard(token)
      .catch((e) => {
        if (!active) return;
        setError(e.message);
        setAuthenticated(false);
        setToken('');
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authenticated, loadDashboard, token]);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!data.ok || !data.token) throw new Error(data.error || 'Đăng nhập thất bại.');

      sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setToken(data.token);
      await loadDashboard(data.token);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    try {
      await loadDashboard();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthenticated(false);
    setToken('');
    setUsername('');
    setPassword('');
    setStats(null);
    setUsers(null);
    setOrders(null);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  };

  if (!authenticated) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          bgcolor: 'background.default',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%', maxWidth: 400, borderRadius: 3 }}>
          <Stack spacing={2.5} alignItems="center">
            <AdminIcon sx={{ fontSize: 52, color: 'primary.main' }} />
            <Box textAlign="center">
              <Typography variant="h6" fontWeight={700}>Đăng nhập Quản Trị</Typography>
              <Typography variant="body2" color="text.secondary">AutoZalo Admin Panel</Typography>
            </Box>

            {error && <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>}

            <TextField
              fullWidth
              label="Tài khoản"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AdminIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              fullWidth
              label="Mật khẩu"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <Button
                      size="small"
                      onClick={() => setShowPassword((v) => !v)}
                      sx={{ minWidth: 0, p: 0.5 }}
                    >
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </Button>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleLogin}
              disabled={loading || !username.trim() || !password.trim()}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  const s = stats || {};

  return (
    <Box sx={{ p: 3, maxWidth: 1280, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AdminIcon sx={{ color: 'primary.main', fontSize: 32 }} />
          <Box>
            <Typography variant="h5" fontWeight={800}>Bảng Quản Trị</Typography>
            <Typography variant="caption" color="text.secondary">AutoZalo Admin Dashboard</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={handleRefresh}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={14} /> : null}
          >
            Làm mới
          </Button>
          <Button variant="text" size="small" color="error" onClick={handleLogout}>
            Đăng xuất
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <StatCard icon={<GroupIcon />} label="Tổng người dùng" value={s.totalUsers ?? '—'} color="primary" />
        <StatCard icon={<UserIcon />} label="Đang dùng gần đây" value={s.activeUsers ?? '—'} color="info" />
        <StatCard icon={<ActiveIcon />} label="Đang trả phí" value={s.activeSubs ?? '—'} color="success" sub={`${s.expiredSubs ?? 0} hết hạn`} />
        <StatCard icon={<PendingIcon />} label="Dùng miễn phí" value={s.freeUsers ?? '—'} color="warning" />
        <StatCard icon={<RevenueIcon />} label="Tổng doanh thu" value={fmtMoney(s.totalRevenue)} color="secondary" sub={`${s.paidOrders ?? 0} đơn thành công`} />
      </Box>

      {s.revenueByPlan && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
          {Object.entries(s.revenueByPlan).map(([plan, rev]) => (
            <Card key={plan} variant="outlined" sx={{ flex: 1, minWidth: 120 }}>
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Chip label={PLAN_LABELS[plan] || plan} color={PLAN_COLORS[plan] || 'default'} size="small" sx={{ mb: 0.5 }} />
                <Typography variant="body2" fontWeight={700}>{fmtMoney(rev)}</Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Divider sx={{ mb: 2 }} />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Người dùng (${users?.length ?? '…'})`} />
        <Tab label={`Đơn hàng (${orders?.length ?? '…'})`} />
      </Tabs>

      {tab === 0 && (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          {!users ? (
            <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Hoạt động</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Gói</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Trạng thái</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Bắt đầu</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Hết hạn</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Lần cuối dùng</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Số acc</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Tổng chi</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Đơn</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                        Chưa có người dùng
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((u) => (
                      <TableRow key={u.userId} hover>
                        <TableCell>
                          <Tooltip title={u.userId} placement="top">
                            <Typography variant="body2" noWrap sx={{ maxWidth: 220 }}>{u.email}</Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Chip label={u.isUsing ? 'Đang dùng' : 'Không hoạt động'} color={u.isUsing ? 'info' : 'default'} size="small" variant={u.isUsing ? 'filled' : 'outlined'} />
                        </TableCell>
                        <TableCell>
                          {u.planKey ? (
                            <Chip label={PLAN_LABELS[u.planKey] || u.planKey} color={PLAN_COLORS[u.planKey] || 'default'} size="small" />
                          ) : (
                            <Typography variant="caption" color="text.disabled">—</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip label={STATUS_LABELS[u.status] || u.status} color={STATUS_COLORS[u.status] || 'default'} size="small" variant={u.status === 'active' ? 'filled' : 'outlined'} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{fmtDate(u.startedAt)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color={u.status === 'expired' ? 'error.main' : 'text.primary'}>
                            {fmtDate(u.expiresAt)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{fmtDateTime(u.lastSeenAt)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">{u.maxAccounts || 0}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600}>{fmtMoney(u.totalSpent)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">{u.orderCount}</Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Box>
          )}
        </Paper>
      )}

      {tab === 1 && (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          {!orders ? (
            <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Mã đơn</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Gói</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Kỳ hạn</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Số tiền</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Trạng thái</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Tạo lúc</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Thanh toán lúc</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                        Chưa có đơn hàng
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((o) => (
                      <TableRow key={o.code} hover>
                        <TableCell>
                          <Typography variant="caption" fontFamily="monospace" fontWeight={700}>{o.code}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>{o.userEmail || '—'}</Typography>
                        </TableCell>
                        <TableCell>
                          {o.planKey ? (
                            <Chip label={PLAN_LABELS[o.planKey] || o.planKey} color={PLAN_COLORS[o.planKey] || 'default'} size="small" />
                          ) : (
                            <Typography variant="caption" color="text.disabled">—</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{o.period === 'yearly' ? 'Năm' : 'Tháng'}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600}>{fmtMoney(o.amount)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={STATUS_LABELS[o.status] || o.status} color={STATUS_COLORS[o.status] || 'default'} size="small" variant={o.status === 'paid' ? 'filled' : 'outlined'} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{fmtDateTime(o.createdAt)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{fmtDateTime(o.paidAt)}</Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Box>
          )}
        </Paper>
      )}
    </Box>
  );
}
