import React from 'react';
import { Box, Typography, Paper, Button } from '@mui/material';
import { GoogleLogin, useGoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [showFallback, setShowFallback] = React.useState(false);

  // Already logged in → redirect back
  React.useEffect(() => {
    if (user) navigate('/reach', { replace: true });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show fallback button if Google One Tap doesn't render within 3s
  React.useEffect(() => {
    const timer = setTimeout(() => setShowFallback(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleSuccess = (credentialResponse) => {
    const decoded = jwtDecode(credentialResponse.credential);
    login({
      name: decoded.name,
      email: decoded.email,
      picture: decoded.picture,
      sub: decoded.sub,
    });
    navigate('/reach', { replace: true });
  };

  // Fallback: OAuth popup flow (fetches user info from Google API)
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });
      const profile = await res.json();
      login({
        name: profile.name,
        email: profile.email,
        picture: profile.picture,
        sub: profile.sub,
      });
      navigate('/reach', { replace: true });
    },
    onError: () => console.error('Google login failed'),
  });

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
              onClick={() => googleLogin()}
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
