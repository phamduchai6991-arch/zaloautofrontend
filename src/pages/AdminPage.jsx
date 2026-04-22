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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
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
  LibraryBooks as LibraryIcon,
  Category as CategoryIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  MenuBook as GuideIcon,
  Save as SaveIcon,
  SmartDisplay as VideoIcon,
} from '@mui/icons-material';
import { notifySubscriptionChanged } from '../contexts/SubscriptionContext';

const API_BASE = import.meta.env.VITE_BACKEND_URL || '';
const ADMIN_TOKEN_KEY = 'autozalo_admin_token';
const GUIDE_VIDEO_DEMO_URL = 'https://www.youtube.com/embed/ysz5S6PUM-U';

const PLAN_LABELS = { basic: 'Basic', plus: 'Plus', pro: 'Pro' };
const PLAN_COLORS = { basic: 'info', plus: 'primary', pro: 'secondary' };
const STATUS_COLORS = { active: 'success', expired: 'error', free: 'default', pending: 'warning', paid: 'success', cancelled: 'default' };
const STATUS_LABELS = { active: 'Đang dùng', expired: 'Hết hạn', free: 'Miễn phí', pending: 'Chờ thanh toán', paid: 'Đã thanh toán', cancelled: 'Đã huỷ' };

function getAdminErrorMessage(error) {
  const message = String(error?.message || error || '').trim();

  if (/failed to fetch|load failed|networkerror/i.test(message)) {
    if (!API_BASE) {
      return 'Frontend đang deploy dạng static nhưng VITE_BACKEND_URL đang để trống. Hãy trỏ VITE_BACKEND_URL tới backend Render rồi redeploy frontend.';
    }

    return 'Không gọi được backend. Hãy kiểm tra VITE_BACKEND_URL ở frontend và ZALOWEB_ALLOWED_ORIGINS ở backend.';
  }

  if (/unexpected token|not valid json/i.test(message)) {
    return 'API trả về HTML thay vì JSON. Thường là frontend đang gọi sai domain backend hoặc /api chưa trỏ tới backend thật.';
  }

  return message || 'Đã xảy ra lỗi khi kết nối tới backend quản trị.';
}

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

function parseVideoInput(text) {
  return String(text || '').trim();
}

function toYoutubeEmbedUrl(rawUrl) {
  try {
    const text = String(rawUrl || '').trim();
    const iframeMatch = text.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    const candidate = iframeMatch?.[1] ? iframeMatch[1].trim() : text;
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname;

    const buildEmbed = (id) => {
      const videoId = String(id || '').trim();
      return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
    };

    if (host === 'youtu.be') {
      const id = path.split('/').filter(Boolean)[0] || '';
      return buildEmbed(id);
    }

    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const watchId = url.searchParams.get('v');
      if (watchId) return buildEmbed(watchId);

      const segments = path.split('/').filter(Boolean);
      if (segments.length >= 2 && ['embed', 'shorts', 'live'].includes(segments[0])) {
        return buildEmbed(segments[1]);
      }
    }
  } catch {
    return '';
  }
  return '';
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
  const [successMessage, setSuccessMessage] = useState('');
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [grantTarget, setGrantTarget] = useState(null);
  const [grantPlan, setGrantPlan] = useState('basic');
  const [grantPeriod, setGrantPeriod] = useState('monthly');
  const [grantSubmitting, setGrantSubmitting] = useState(false);

  // Group library state
  const [categories, setCategories] = useState([]);
  const [libraryGroups, setLibraryGroups] = useState([]);
  const [glLoading, setGlLoading] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#1976d2');
  const [editingCat, setEditingCat] = useState(null);
  const [bulkText, setBulkText] = useState('');
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [glFilterCat, setGlFilterCat] = useState('');
  const [editingGroup, setEditingGroup] = useState(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideSaving, setGuideSaving] = useState(false);
  const [guideVideoValue, setGuideVideoValue] = useState('');
  const [guideUpdatedAt, setGuideUpdatedAt] = useState('');

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

  const loadGroupLibrary = useCallback(
    async (currentToken = token) => {
      setGlLoading(true);
      try {
        const [catData, grData] = await Promise.all([
          adminFetch('/api/admin/group-library/categories', currentToken),
          adminFetch('/api/admin/group-library/groups', currentToken),
        ]);
        setCategories(catData.categories || []);
        setLibraryGroups(grData.groups || []);
      } catch {
        // silently ignore — data will appear empty
      } finally {
        setGlLoading(false);
      }
    },
    [adminFetch, token],
  );

  const loadGuideContent = useCallback(
    async (currentToken = token) => {
      setGuideLoading(true);
      try {
        const data = await adminFetch('/api/admin/guide-content', currentToken);
        const guide = data?.guide || {};
        setGuideVideoValue(String(guide.videoEmbedUrl || ''));
        setGuideUpdatedAt(String(guide.updatedAt || ''));
      } finally {
        setGuideLoading(false);
      }
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
        setError(getAdminErrorMessage(e));
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

  // Load group library data when tab switches to it
  React.useEffect(() => {
    if (authenticated && tab === 2) loadGroupLibrary();
  }, [authenticated, tab, loadGroupLibrary]);

  React.useEffect(() => {
    if (authenticated && tab === 3) {
      loadGuideContent().catch((e) => setError(getAdminErrorMessage(e)));
    }
  }, [authenticated, tab, loadGuideContent]);

  const handleSaveGuide = async () => {
    setGuideSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/guide-content`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          videoEmbedUrl: parseVideoInput(guideVideoValue),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Không lưu được nội dung hướng dẫn.');
      }
      const updatedGuide = data?.guide || {};
      setGuideVideoValue(String(updatedGuide.videoEmbedUrl || ''));
      setGuideUpdatedAt(String(updatedGuide.updatedAt || ''));
      setSuccessMessage('Đã lưu nội dung Hướng Dẫn Sử Dụng thành công.');
    } catch (e) {
      setError(getAdminErrorMessage(e));
    } finally {
      setGuideSaving(false);
    }
  };

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
      setError(getAdminErrorMessage(e));
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
      setError(getAdminErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenGrantDialog = (user) => {
    setGrantTarget(user);
    setGrantPlan(user?.planKey || 'basic');
    setGrantPeriod('monthly');
    setGrantDialogOpen(true);
  };

  const handleCloseGrantDialog = () => {
    if (grantSubmitting) return;
    setGrantDialogOpen(false);
    setGrantTarget(null);
  };

  const handleGrantSubscription = async () => {
    if (!grantTarget?.userId || !grantTarget?.email) return;

    setGrantSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      const res = await fetch(`${API_BASE}/api/admin/grant-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: grantTarget.userId,
          userEmail: grantTarget.email,
          planKey: grantPlan,
          period: grantPeriod,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Không cấp được gói cho tài khoản này.');
      }

      setSuccessMessage(`Đã cấp gói ${PLAN_LABELS[grantPlan] || grantPlan} (${grantPeriod === 'yearly' ? 'năm' : 'tháng'}) cho ${grantTarget.email}.`);
      notifySubscriptionChanged(grantTarget.userId);
      setGrantDialogOpen(false);
      setGrantTarget(null);
      await loadDashboard();
    } catch (e) {
      setError(getAdminErrorMessage(e));
    } finally {
      setGrantSubmitting(false);
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
    setCategories([]);
    setLibraryGroups([]);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  };

  // ─── Group Library handlers ───

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/group-library/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newCatName.trim(), color: newCatColor }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi tạo danh mục.');
      setNewCatName('');
      setNewCatColor('#1976d2');
      await loadGroupLibrary();
    } catch (e) {
      setError(getAdminErrorMessage(e));
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCat) return;
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/group-library/categories`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: editingCat.id, name: editingCat.name, color: editingCat.color }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi cập nhật danh mục.');
      setEditingCat(null);
      await loadGroupLibrary();
    } catch (e) {
      setError(getAdminErrorMessage(e));
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Xoá danh mục này? Nhóm thuộc danh mục sẽ thành "Chưa phân loại".')) return;
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/group-library/categories`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi xoá danh mục.');
      await loadGroupLibrary();
    } catch (e) {
      setError(getAdminErrorMessage(e));
    }
  };

  const handleBulkAddGroups = async () => {
    if (!bulkText.trim()) return;
    setBulkSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/group-library/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lines: bulkText, categoryId: bulkCategoryId || null }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi thêm nhóm.');
      setSuccessMessage(`Đã thêm ${data.count} nhóm thành công.`);
      setBulkText('');
      await loadGroupLibrary();
    } catch (e) {
      setError(getAdminErrorMessage(e));
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleDeleteGroup = async (id) => {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/group-library/groups`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi xoá nhóm.');
      await loadGroupLibrary();
    } catch (e) {
      setError(getAdminErrorMessage(e));
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup) return;
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/group-library/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: editingGroup.id,
          name: editingGroup.name,
          inviteLink: editingGroup.invite_link,
          description: editingGroup.description,
          categoryId: editingGroup.category_id,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Lỗi cập nhật nhóm.');
      setEditingGroup(null);
      await loadGroupLibrary();
    } catch (e) {
      setError(getAdminErrorMessage(e));
    }
  };

  const filteredLibraryGroups = glFilterCat
    ? libraryGroups.filter((g) => String(g.category_id) === String(glFilterCat))
    : libraryGroups;

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
      {successMessage && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>{successMessage}</Alert>}

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
        <Tab icon={<LibraryIcon />} iconPosition="start" label={`Thư viện nhóm (${libraryGroups.length})`} />
        <Tab icon={<GuideIcon />} iconPosition="start" label="Hướng dẫn sử dụng" />
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
                    <TableCell sx={{ fontWeight: 700 }} align="right">Thao tác</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} align="center" sx={{ color: 'text.secondary', py: 4 }}>
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
                        <TableCell align="right">
                          <Button size="small" variant="outlined" onClick={() => handleOpenGrantDialog(u)}>
                            Nâng cấp gói
                          </Button>
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

      {tab === 2 && (
        <Box>
          {glLoading ? (
            <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
          ) : (
            <Stack spacing={3}>
              {/* ─── Category Management ─── */}
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CategoryIcon fontSize="small" /> Danh mục
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  {categories.map((cat) => (
                    <Chip
                      key={cat.id}
                      label={cat.name}
                      sx={{ bgcolor: cat.color, color: '#fff', fontWeight: 600 }}
                      onDelete={() => handleDeleteCategory(cat.id)}
                      onClick={() => setEditingCat({ ...cat })}
                    />
                  ))}
                  {categories.length === 0 && (
                    <Typography variant="body2" color="text.secondary">Chưa có danh mục nào.</Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    placeholder="Tên danh mục mới"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                    sx={{ flex: 1 }}
                  />
                  <input
                    type="color"
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    style={{ width: 36, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  />
                  <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAddCategory} disabled={!newCatName.trim()}>
                    Thêm
                  </Button>
                </Box>
              </Paper>

              {/* ─── Bulk Import ─── */}
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AddIcon fontSize="small" /> Thêm nhóm hàng loạt
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Mỗi dòng 1 nhóm. Định dạng: <b>Tên nhóm | Link mời | Mô tả</b> (chỉ cần link cũng được)
                </Typography>
                <TextField
                  multiline
                  minRows={4}
                  maxRows={12}
                  fullWidth
                  placeholder={`Nhóm Tài chính VN | https://zalo.me/g/abc123 | Nhóm trao đổi tài chính\nhttps://zalo.me/g/xyz456\nNhóm BDS Sài Gòn | https://zalo.me/g/bds789`}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  sx={{ mb: 1.5 }}
                />
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    select
                    size="small"
                    label="Danh mục"
                    value={bulkCategoryId}
                    onChange={(e) => setBulkCategoryId(e.target.value)}
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="">— Chưa phân loại —</MenuItem>
                    {categories.map((cat) => (
                      <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
                    ))}
                  </TextField>
                  <Button
                    variant="contained"
                    onClick={handleBulkAddGroups}
                    disabled={bulkSubmitting || !bulkText.trim()}
                    startIcon={bulkSubmitting ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
                  >
                    {bulkSubmitting ? 'Đang thêm...' : 'Thêm nhóm'}
                  </Button>
                </Box>
              </Paper>

              {/* ─── Group List ─── */}
              <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                <Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2" fontWeight={700}>Lọc:</Typography>
                  <Chip
                    label="Tất cả"
                    size="small"
                    variant={!glFilterCat ? 'filled' : 'outlined'}
                    color={!glFilterCat ? 'primary' : 'default'}
                    onClick={() => setGlFilterCat('')}
                  />
                  {categories.map((cat) => (
                    <Chip
                      key={cat.id}
                      label={cat.name}
                      size="small"
                      variant={String(glFilterCat) === String(cat.id) ? 'filled' : 'outlined'}
                      sx={String(glFilterCat) === String(cat.id) ? { bgcolor: cat.color, color: '#fff' } : {}}
                      onClick={() => setGlFilterCat(String(glFilterCat) === String(cat.id) ? '' : String(cat.id))}
                    />
                  ))}
                </Box>
                <Divider />
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Tên nhóm</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Link mời</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Mô tả</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Danh mục</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Ngày thêm</TableCell>
                        <TableCell sx={{ fontWeight: 700 }} align="right">Thao tác</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredLibraryGroups.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                            Chưa có nhóm nào trong thư viện.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredLibraryGroups.map((g, idx) => (
                          <TableRow key={g.id} hover>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{g.name || '—'}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" noWrap sx={{ maxWidth: 220, display: 'block' }}>
                                {g.invite_link || '—'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" noWrap sx={{ maxWidth: 160 }}>{g.description || '—'}</Typography>
                            </TableCell>
                            <TableCell>
                              {g.category_name ? (
                                <Chip label={g.category_name} size="small" sx={{ bgcolor: g.category_color, color: '#fff', fontWeight: 600 }} />
                              ) : (
                                <Typography variant="caption" color="text.disabled">Chưa phân loại</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">{fmtDateTime(g.created_at)}</Typography>
                            </TableCell>
                            <TableCell align="right">
                              <IconButton size="small" onClick={() => setEditingGroup({ ...g })}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton size="small" color="error" onClick={() => handleDeleteGroup(g.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </Box>
              </Paper>
            </Stack>
          )}
        </Box>
      )}

      {tab === 3 && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          {guideLoading ? (
            <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={700}>
                Chỉnh sửa video trang Hướng Dẫn Sử Dụng
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Chỉ cần thay link nhúng YouTube hoặc dán nguyên đoạn iframe YouTube vào ô bên dưới.
              </Typography>

              <TextField
                label="Link nhúng video YouTube"
                multiline
                minRows={4}
                maxRows={8}
                fullWidth
                value={guideVideoValue}
                onChange={(e) => setGuideVideoValue(e.target.value)}
                helperText="Dán link YouTube hoặc iframe embed. Chỉ có 1 trường duy nhất này."
                placeholder={`<iframe width="560" height="315" src="https://www.youtube.com/embed/VnxUJ-6x0Vw?si=cPj3FfnJChkVE5kT" title="YouTube video player"></iframe>`}
              />

              {parseVideoInput(guideVideoValue) && (
                <Stack spacing={1}>
                  <Typography variant="body2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <VideoIcon fontSize="small" /> Xem trước video embed
                  </Typography>
                  {(() => {
                    const embed = toYoutubeEmbedUrl(guideVideoValue);
                    if (!embed) {
                      return <Alert severity="warning">Link hoặc iframe YouTube chưa hợp lệ.</Alert>;
                    }
                    return (
                      <Box sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                        <Box
                          component="iframe"
                          src={embed}
                          title="guide_video_preview"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                          sx={{ width: '100%', height: { xs: 220, md: 300 }, border: 0 }}
                        />
                      </Box>
                    );
                  })()}
                </Stack>
              )}

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">
                  Cập nhật lần cuối: {fmtDateTime(guideUpdatedAt)}
                </Typography>
                <Button
                  variant="contained"
                  onClick={handleSaveGuide}
                  disabled={guideSaving}
                  startIcon={guideSaving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                >
                  {guideSaving ? 'Đang lưu...' : 'Lưu hướng dẫn'}
                </Button>
              </Box>
            </Stack>
          )}
        </Paper>
      )}

      {/* ─── Edit Category Dialog ─── */}
      <Dialog open={Boolean(editingCat)} onClose={() => setEditingCat(null)} fullWidth maxWidth="xs">
        <DialogTitle>Sửa danh mục</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label="Tên danh mục"
              value={editingCat?.name || ''}
              onChange={(e) => setEditingCat((prev) => prev ? { ...prev, name: e.target.value } : null)}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">Màu:</Typography>
              <input
                type="color"
                value={editingCat?.color || '#1976d2'}
                onChange={(e) => setEditingCat((prev) => prev ? { ...prev, color: e.target.value } : null)}
                style={{ width: 40, height: 36, border: 'none', borderRadius: 4, cursor: 'pointer' }}
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingCat(null)}>Hủy</Button>
          <Button onClick={handleUpdateCategory} variant="contained">Lưu</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Edit Group Dialog ─── */}
      <Dialog open={Boolean(editingGroup)} onClose={() => setEditingGroup(null)} fullWidth maxWidth="sm">
        <DialogTitle>Sửa nhóm</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label="Tên nhóm"
              value={editingGroup?.name || ''}
              onChange={(e) => setEditingGroup((prev) => prev ? { ...prev, name: e.target.value } : null)}
            />
            <TextField
              fullWidth
              label="Link mời"
              value={editingGroup?.invite_link || ''}
              onChange={(e) => setEditingGroup((prev) => prev ? { ...prev, invite_link: e.target.value } : null)}
            />
            <TextField
              fullWidth
              label="Mô tả"
              value={editingGroup?.description || ''}
              onChange={(e) => setEditingGroup((prev) => prev ? { ...prev, description: e.target.value } : null)}
            />
            <TextField
              select
              fullWidth
              label="Danh mục"
              value={editingGroup?.category_id || ''}
              onChange={(e) => setEditingGroup((prev) => prev ? { ...prev, category_id: e.target.value || null } : null)}
            >
              <MenuItem value="">— Chưa phân loại —</MenuItem>
              {categories.map((cat) => (
                <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingGroup(null)}>Hủy</Button>
          <Button onClick={handleUpdateGroup} variant="contained">Lưu</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={grantDialogOpen} onClose={handleCloseGrantDialog} fullWidth maxWidth="xs">
        <DialogTitle>Nâng cấp gói tài khoản</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              {grantTarget?.email || 'Tài khoản người dùng'}
            </Alert>
            <TextField
              select
              label="Gói"
              value={grantPlan}
              onChange={(e) => setGrantPlan(e.target.value)}
              fullWidth
            >
              {Object.entries(PLAN_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>{label}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Kỳ hạn"
              value={grantPeriod}
              onChange={(e) => setGrantPeriod(e.target.value)}
              fullWidth
            >
              <MenuItem value="monthly">1 tháng</MenuItem>
              <MenuItem value="yearly">1 năm</MenuItem>
            </TextField>
            <Typography variant="body2" color="text.secondary">
              Nếu tài khoản đang còn hạn, hệ thống sẽ nâng gói ngay và cộng thêm thời gian vào hạn hiện tại.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseGrantDialog} disabled={grantSubmitting}>Hủy</Button>
          <Button onClick={handleGrantSubscription} variant="contained" disabled={grantSubmitting || !grantTarget?.userId}>
            {grantSubmitting ? 'Đang áp dụng...' : 'Áp dụng'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
