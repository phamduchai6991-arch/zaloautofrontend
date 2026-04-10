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

export default function AccountsPage() {
  const {
    accounts,
    activeAccountIndex,
    setActiveAccountIndex,
    refreshActiveAccountFromService,
    removeAccount,
  } = useAccount();
  const [feedback, setFeedback] = useState(null);

  const handleRefresh = async () => {
    try {
      const result = await refreshActiveAccountFromService();
      setFeedback({
        severity: result ? 'success' : 'warning',
        message: result ? 'Đã đồng bộ lại tài khoản đang chọn từ local service.' : 'Không có dữ liệu mới để đồng bộ.',
      });
    } catch (error) {
      setFeedback({ severity: 'error', message: error.message });
    }
  };

  return (
    <Box sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>Tài Khoản Zalo</Typography>
        <Button variant="outlined" onClick={handleRefresh} disabled={activeAccountIndex < 0}>Làm mới tài khoản đang chọn</Button>
      </Box>

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