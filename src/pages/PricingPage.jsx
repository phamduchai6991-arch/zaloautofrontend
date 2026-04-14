import React, { useState } from 'react';
import {
  Box,
  Typography,
  Switch,
  Card,
  CardContent,
  Button,
  Divider,
  Stack,
  Chip,
} from '@mui/material';
import {
  OpenInNew as OpenInNewIcon,
  AccountBalance as BankIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import PaymentDialog from '../components/PaymentDialog';

const PLANS = [
  {
    key: 'basic',
    name: 'BASIC',
    color: '#22c55e',
    chipBg: 'transparent',
    chipColor: '#212B36',
    priceMonthly: 60000,
    priceYearlyPerMonth: 25000,
    priceYearly: 300000,
    features: [
      'Dùng với 1 Zalo',
      'Nhắn tin hàng loạt',
      'Kết bạn',
      'Xóa bạn',
      'Rút lại lời mời',
      'Rời nhóm',
      'Từ chối/đồng ý lời mời kết bạn',
    ],
    includesFrom: null,
  },
  {
    key: 'plus',
    name: 'PLUS',
    color: '#0068FF',
    chipBg: 'transparent',
    chipColor: '#212B36',
    priceMonthly: 120000,
    priceYearlyPerMonth: 50000,
    priceYearly: 600000,
    popular: true,
    features: [
      'Dùng với 3 Zalo',
      'Nhắn tin hàng loạt + AI',
      'Kết bạn + AI',
      'Tin nhắn nhanh',
      'Phân loại liên hệ',
      'Quản lý hội thoại',
      'Bật/tắt thông báo',
    ],
    includesFrom: 'BASIC',
  },
  {
    key: 'pro',
    name: 'PRO',
    color: '#ef4444',
    chipBg: '#0068FF',
    chipColor: '#fff',
    priceMonthly: 240000,
    priceYearlyPerMonth: 100000,
    priceYearly: 1200000,
    features: [
      'Dùng với 10 Zalo',
      'Kéo nhóm',
      'Tham gia nhóm',
      'Hiển thị thành viên ẩn',
    ],
    includesFrom: 'PLUS',
  },
];

function formatPrice(value) {
  return value.toLocaleString('vi-VN') + 'đ';
}

function PlanCard({ plan, yearly, onBuy }) {
  const price = yearly ? plan.priceYearlyPerMonth : plan.priceMonthly;
  const isPopular = plan.popular;

  return (
    <Card
      elevation={0}
      sx={{
        flex: '1 1 0',
        minWidth: 260,
        maxWidth: 360,
        border: '1.5px solid',
        borderColor: isPopular ? 'primary.main' : 'divider',
        borderRadius: 3,
        boxShadow: isPopular
          ? '0 0 0 1px rgba(0,104,255,0.08), 0 12px 24px -4px rgba(0,104,255,0.12)'
          : '0 0 0 1px rgba(145,158,171,0.08)',
        transition: 'box-shadow 0.25s, border-color 0.25s',
        '&:hover': {
          borderColor: plan.color,
          boxShadow: `0 0 0 1px ${plan.color}22, 0 12px 24px -4px ${plan.color}20`,
        },
      }}
    >
      <CardContent sx={{ p: 3.5, '&:last-child': { pb: 3.5 } }}>
        {/* Plan name */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Chip
            label={plan.name}
            size="small"
            icon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            sx={{
              fontWeight: 700,
              fontSize: '0.8rem',
              bgcolor: plan.chipBg,
              color: plan.chipColor,
              border: plan.chipBg === 'transparent' ? '1px solid' : 'none',
              borderColor: 'divider',
              '& .MuiChip-icon': { color: plan.chipColor },
            }}
          />
        </Box>

        {/* Price */}
        <Box sx={{ mb: 0.5 }}>
          <Typography
            component="span"
            sx={{ fontSize: '2rem', fontWeight: 800, color: plan.color, lineHeight: 1.2 }}
          >
            {formatPrice(price)}
          </Typography>
          <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary', ml: 0.5 }}>
            /tháng
          </Typography>
        </Box>

        {/* Yearly total */}
        {yearly && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
            ≈ {formatPrice(plan.priceYearly)}/năm
          </Typography>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Includes from */}
        {plan.includesFrom && (
          <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary', fontWeight: 500 }}>
            Tất cả tính năng của gói {plan.includesFrom}, và:
          </Typography>
        )}

        {/* Features */}
        <Stack spacing={1.2}>
          {plan.features.map((f, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: plan.color,
                  mt: '7px',
                  flexShrink: 0,
                }}
              />
              <Typography variant="body2" sx={{ color: 'text.primary' }}>
                {f}
              </Typography>
            </Box>
          ))}
        </Stack>

        <Button
          variant={isPopular ? 'contained' : 'outlined'}
          fullWidth
          onClick={() => onBuy(plan)}
          sx={{
            mt: 3,
            py: 1.2,
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 1.5,
            fontSize: '0.95rem',
            ...(isPopular
              ? { bgcolor: plan.color, '&:hover': { bgcolor: plan.color, filter: 'brightness(0.9)' } }
              : { borderColor: plan.color, color: plan.color, '&:hover': { borderColor: plan.color, bgcolor: `${plan.color}10` } }),
          }}
        >
          Mua gói {plan.name}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PricingPage() {
  const [yearly, setYearly] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const { user } = useAuth();
  const { refetch } = useSubscription();
  const navigate = useNavigate();

  const handleBuy = (plan) => {
    if (!user) {
      window.location.assign('/login');
      return;
    }
    setSelectedPlan(plan);
    setPaymentOpen(true);
  };

  const handlePaymentClose = (success) => {
    setPaymentOpen(false);
    setSelectedPlan(null);
    if (success) refetch();
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', py: 5, px: 3 }}>
      {/* Title */}
      <Typography
        variant="h4"
        sx={{ fontWeight: 800, textAlign: 'center', mb: 1, fontFamily: '"Public Sans", serif' }}
      >
        BẢNG GIÁ
      </Typography>

      {/* Toggle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, mb: 5 }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: yearly ? 400 : 600, color: yearly ? 'text.secondary' : 'text.primary' }}
        >
          Tháng
        </Typography>
        <Switch
          checked={yearly}
          onChange={(e) => setYearly(e.target.checked)}
          sx={{
            '& .MuiSwitch-switchBase.Mui-checked': { color: '#0068FF' },
            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#0068FF' },
          }}
        />
        <Typography
          variant="body2"
          sx={{ fontWeight: yearly ? 600 : 400, color: yearly ? 'text.primary' : 'text.secondary' }}
        >
          Năm
        </Typography>
      </Box>

      {/* Plan cards */}
      <Box
        sx={{
          display: 'flex',
          gap: 3,
          justifyContent: 'center',
          flexWrap: 'wrap',
          mb: 5,
        }}
      >
        {PLANS.map((plan) => (
          <PlanCard key={plan.key} plan={plan} yearly={yearly} onBuy={handleBuy} />
        ))}
      </Box>

      {/* Payment methods */}
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 700, textAlign: 'center', mb: 2 }}
      >
        Hình thức thanh toán
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Button
          variant="outlined"
          startIcon={<BankIcon />}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            px: 4,
            py: 1.5,
            fontSize: '0.95rem',
            borderColor: 'divider',
            color: 'text.primary',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.light' },
          }}
        >
          Chuyển khoản ngân hàng (tự động xác nhận)
        </Button>
      </Box>

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentOpen}
        onClose={handlePaymentClose}
        plan={selectedPlan}
        period={yearly ? 'yearly' : 'monthly'}
        user={user}
      />
    </Box>
  );
}
