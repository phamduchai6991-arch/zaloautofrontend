import React, { useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useAccount } from '../contexts/AccountContext';
import { useSubscription, PLAN_LABELS } from '../contexts/SubscriptionContext';
import { useNavigate } from 'react-router-dom';

export default function AccountsPage() {
  const navigate = useNavigate();
  const {
    accounts,
    activeAccountIndex,
    setActiveAccountIndex,
    refreshActiveAccountFromService,
    refreshAccount,
    refreshAccountViaBackend,
    removeAccount,
  } = useAccount();
  const { subscription, planKey, maxAccounts, isActive, isExpired, daysLeft } = useSubscription();
  const [feedback, setFeedback] = useState(null);

  const handleRefresh = async () => {
    try {
      setFeedback({ severity: 'info', message: 'Đang đồng bộ tài khoản qua server...' });
      const backendPatch = await refreshAccountViaBackend();
      if (backendPatch) {
        const friendCount = backendPatch.friends?.length || 0;
        const groupCount = backendPatch.groups?.length || 0;
        setFeedback({
          severity: 'success',
          message: `Đã cập nhật tài khoản: ${friendCount} bạn bè, ${groupCount} nhóm.`,
        });
        return;
      }
      setFeedback({
        severity: 'warning',
        message: 'Không thể đồng bộ — tài khoản chưa có session. Hãy xóa và thêm lại.',
      });
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: `Đồng bộ thất bại: ${error?.message || 'Lỗi không xác định'}`,
      });
    }
  };

  // Subscription status banner
  const renderSubscriptionBanner = () => {
    if (!subscription && accounts.length === 0) return null;

    if (!subscription || (!isActive && !isExpired)) {
      if (accounts.length > 0) return null; // Free / basic users with accounts — no nag
      return (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={<Button color="info" size="small" onClick={() => navigate('/pricing')}>Nâng cấp</Button>}
        >
          Bạn đang dùng gói miễn phí (tối đa 1 tài khoản). Nâng cấp để thêm nhiều tài khoản hơn.
        </Alert>
      );
    }

    if (isExpired) {
      return (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={<Button color="error" size="small" onClick={() => navigate('/pricing')}>Gia hạn</Button>}
        >
          Gói <strong>{PLAN_LABELS[subscription?.planKey] || subscription?.planKey || planKey}</strong> đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.
        </Alert>
      );
    }

    if (isActive && daysLeft <= 7) {
      return (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={<Button color="warning" size="small" onClick={() => navigate('/pricing')}>Gia hạn</Button>}
        >
          Gói <strong>{PLAN_LABELS[planKey] || planKey}</strong> còn <strong>{daysLeft} ngày</strong> nữa hết hạn.
        </Alert>
      );
    }

    return null;
  };

  return (
    <Box sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Tài Khoản Zalo</Typography>
          {isActive ? (
            <Typography variant="caption" color="text.secondary">
              Gói <strong>{PLAN_LABELS[planKey] || planKey}</strong> — {accounts.length}/{maxAccounts} tài khoản •{' '}
              còn {daysLeft} ngày
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">
              Gói miễn phí — {accounts.length}/{maxAccounts} tài khoản
            </Typography>
          )}
        </Box>
        <Button variant="outlined" onClick={handleRefresh} disabled={activeAccountIndex < 0}>Làm mới tài khoản đang chọn</Button>
      </Box>

      {renderSubscriptionBanner()}

      {feedback && (
        <Alert severity={feedback.severity} sx={{ mb: 2 }} onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      <Stack spacing={2}>
        {accounts.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary">Chưa có tài khoản nào được đồng bộ.</Typography>
          </Paper>
        ) : accounts.map((account, index) => {
          const primary = account.name && account.name.toLowerCase() !== 'tài khoản zalo'
            ? account.name
            : account.phone || `ZID ${account.userId || '—'}`;
          const secondary = [account.phone, account.userId ? `ZID ${account.userId}` : ''].filter(Boolean).join(' | ');
          const isActive = index === activeAccountIndex;
          const isReady = account.syncStatus === 'ready';

          return (
            <Paper key={account.id || index} variant="outlined" sx={{ p: 2, borderColor: isActive ? 'primary.main' : 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                  <Avatar src={account.avatar} sx={{ width: 44, height: 44 }}>
                    {primary?.[0] || 'Z'}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={700} noWrap>{primary}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{secondary || 'Chưa có số điện thoại hoặc ZID'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Bạn bè: {account.friends?.length || 0} | Nhóm: {account.groups?.length || 0}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {isActive && <Chip label="Đang chọn" color="primary" size="small" />}
                  <Chip label={isReady ? 'Sẵn sàng' : 'Chưa sẵn sàng'} color={isReady ? 'success' : 'default'} size="small" variant={isReady ? 'filled' : 'outlined'} />
                  <Button variant={isActive ? 'contained' : 'outlined'} size="small" onClick={() => setActiveAccountIndex(index)}>
                    {isActive ? 'Đang dùng' : 'Chọn'}
                  </Button>
                  <Button color="error" size="small" onClick={() => removeAccount(index)}>Xóa</Button>
                </Box>
              </Box>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}