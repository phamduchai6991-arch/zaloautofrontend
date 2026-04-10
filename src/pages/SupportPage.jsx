import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Avatar,
  Stack,
  Button,
  Divider,
} from '@mui/material';
import {
  HeadsetMic as SupportIcon,
  Phone as PhoneIcon,
  Chat as ChatIcon,
  Email as EmailIcon,
} from '@mui/icons-material';

export default function SupportPage() {
  return (
    <Box sx={{ p: 4, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Hỗ Trợ Online
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Liên hệ với chúng tôi để được hỗ trợ nhanh nhất
      </Typography>

      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main' }}>
            <SupportIcon fontSize="large" />
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight={600}>
              Phạm Thị Mai
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Nhân viên hỗ trợ
            </Typography>
          </Box>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <PhoneIcon color="action" />
            <Box>
              <Typography variant="body2" color="text.secondary">
                Số điện thoại
              </Typography>
              <Typography variant="body1" fontWeight={500}>
                0583.345.345
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <ChatIcon color="action" />
            <Box>
              <Typography variant="body2" color="text.secondary">
                Zalo
              </Typography>
              <Typography variant="body1" fontWeight={500}>
                0583.345.345
              </Typography>
            </Box>
          </Stack>
        </Stack>

        <Button
          variant="contained"
          startIcon={<ChatIcon />}
          href="https://zalo.me/0583345345"
          target="_blank"
          rel="noopener noreferrer"
          fullWidth
          sx={{ mt: 3, py: 1.2, borderRadius: 1.5, textTransform: 'none', fontWeight: 600 }}
        >
          Nhắn tin qua Zalo
        </Button>
      </Paper>
    </Box>
  );
}
