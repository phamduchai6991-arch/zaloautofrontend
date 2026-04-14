import React from 'react';
import { Box, Typography, Paper, Button, Alert, Stack, Avatar } from '@mui/material';
import { GoogleLogin, useGoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [showFallback, setShowFallback] = React.useState(false);
  const [loginError, setLoginError] = React.useState('');

  // Show fallback button if Google One Tap doesn't render within 2s
  React.useEffect(() => {
    const timer = setTimeout(() => setShowFallback(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleSuccess = (credentialResponse) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential);
      login(
        {
          name: decoded.name,
          email: decoded.email,
          picture: decoded.picture,
          sub: decoded.sub,
        },
        {
          authType: 'google-id-token',
          authToken: credentialResponse.credential,
        },
      );
      navigate('/reach', { replace: true });
    } catch (e) {
      setLoginError('Lỗi xử lý token đăng nhập. Hãy thử lại.');
    }
  };

  // Fallback: OAuth popup flow (fetches user info from Google API)
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const profile = await res.json();
        login(
          {
            name: profile.name,
            email: profile.email,
            picture: profile.picture,
            sub: profile.sub,
          },
          {
            authType: 'google-access-token',
            authToken: tokenResponse.access_token,
            expiresIn: tokenResponse.expires_in || 3600,
          },
        );
        navigate('/reach', { replace: true });
      } catch (e) {
        setLoginError('Không lấy được thông tin tài khoản Google. Hãy thử lại.');
      }
    },
    onError: () => setLoginError('Đăng nhập Google thất bại. Hãy thử lại.'),
  });

  if (user) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          py: 6,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 5,
            borderRadius: 3,
            maxWidth: 460,
            width: '100%',
            textAlign: 'center',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack spacing={2.5} alignItems="center">
            <Avatar src={user.picture || ''} alt={user.name || user.email || 'User'} sx={{ width: 72, height: 72 }} />
            <Box>
              <Typography variant="h5" fontWeight={700} gutterBottom>
                Bạn đang đăng nhập
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {user.name || user.email}
              </Typography>
              {user.email && (
                <Typography variant="body2" color="text.secondary">
                  {user.email}
                </Typography>
              )}
            </Box>

            <Alert severity="info" sx={{ width: '100%', textAlign: 'left' }}>
              Route đăng nhập đang hoạt động. Trước đây trang này tự chuyển hướng ngay nên nhìn giống như bấm không có phản hồi.
            </Alert>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: '100%' }}>
              <Button
                fullWidth
                variant="contained"
                onClick={() => navigate('/reach', { replace: true })}
                sx={{ textTransform: 'none', borderRadius: 2 }}
              >
                Vào ứng dụng
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => {
                  logout();
                  setLoginError('');
                }}
                sx={{ textTransform: 'none', borderRadius: 2 }}
              >
                Đăng xuất để đổi tài khoản
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        py: 6,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 5,
          borderRadius: 3,
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box
          component="img"
          src="/autozalo-logo.png"
          alt="AutoZalo"
          sx={{ width: 64, height: 64, mx: 'auto', mb: 2 }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Đăng nhập
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Đăng nhập để sử dụng đầy đủ tính năng AutoZalo
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {loginError && (
            <Alert severity="error" sx={{ width: '100%', mb: 1 }}>{loginError}</Alert>
          )}
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => setShowFallback(true)}
            size="large"
            shape="rectangular"
            text="signin_with"
            locale="vi"
            width="320"
          />
          {showFallback && (
            <Button
              variant="outlined"
              onClick={() => { setLoginError(''); googleLogin(); }}
              sx={{
                textTransform: 'none',
                borderRadius: 2,
                px: 4,
                py: 1,
                fontSize: '0.95rem',
                fontWeight: 600,
                borderColor: '#dadce0',
                color: '#3c4043',
                '&:hover': { bgcolor: '#f7f8f8', borderColor: '#dadce0' },
              }}
              startIcon={
                <Box
                  component="img"
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  sx={{ width: 20, height: 20 }}
                />
              }
            >
              Đăng nhập bằng Google
            </Button>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
