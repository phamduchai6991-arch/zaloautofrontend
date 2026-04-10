import React, { useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Divider,
  Alert,
  Paper,
  Stack,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckIcon,
  Extension as ExtIcon,
  Person as PersonIcon,
  Chat as ChatIcon,
  EditNote as ReachIcon,
  Settings as SettingsIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  Star as StarIcon,
  Group as GroupIcon,
  Schedule as ScheduleIcon,
  AutoAwesome as AIIcon,
} from '@mui/icons-material';

const SECTIONS = [
  {
    id: 'install',
    icon: <ExtIcon />,
    title: 'Cài đặt Extension',
    color: '#ef4444',
    content: (
      <>
        <Alert severity="info" sx={{ mb: 2 }}>
          AutoZalo cần extension "AutoZalo Bridge" để kết nối với Zalo. Hãy cài đặt trước khi sử dụng.
        </Alert>
        <Typography variant="subtitle2" gutterBottom>Các bước cài đặt:</Typography>
        <List dense>
          {[
            'Mở Chrome, vào chrome://extensions',
            'Bật "Chế độ nhà phát triển" (góc phải trên)',
            'Nhấn "Tải tiện ích đã giải nén"',
            'Chọn thư mục extension trong dự án',
            'Bật "Cho phép trong cửa sổ ẩn danh"',
            'Tải lại trang web AutoZalo',
          ].map((step, i) => (
            <ListItem key={i} sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Chip label={i + 1} size="small" sx={{ width: 24, height: 24, fontSize: '0.75rem', fontWeight: 700 }} />
              </ListItemIcon>
              <ListItemText primary={step} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItem>
          ))}
        </List>
        <Alert severity="warning" sx={{ mt: 2 }}>
          Sau khi reload extension, hãy <b>refresh lại trang web</b> (F5) để extension kết nối lại.
        </Alert>
      </>
    ),
  },
  {
    id: 'account',
    icon: <PersonIcon />,
    title: 'Quản lý tài khoản Zalo',
    color: '#0068FF',
    content: (
      <>
        <Typography variant="subtitle2" gutterBottom>Thêm tài khoản</Typography>
        <List dense>
          {[
            'Vào trang "Tài Khoản Zalo" trên sidebar',
            'Nhấn nút "Thêm tài khoản"',
            'Một cửa sổ ẩn danh sẽ mở ra trang chat.zalo.me',
            'Đăng nhập Zalo bằng QR code hoặc số điện thoại',
            'Sau khi đăng nhập thành công, extension sẽ tự động lấy thông tin',
            'Xác nhận đồng bộ tài khoản khi popup hiển thị',
            'Cửa sổ ẩn danh sẽ tự đóng, tài khoản xuất hiện trong danh sách',
          ].map((step, i) => (
            <ListItem key={i} sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Chip label={i + 1} size="small" sx={{ width: 24, height: 24, fontSize: '0.75rem', fontWeight: 700 }} />
              </ListItemIcon>
              <ListItemText primary={step} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItem>
          ))}
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" gutterBottom>Chọn & sử dụng tài khoản</Typography>
        <List dense>
          {[
            'Nhấn "Chọn" trên tài khoản bạn muốn dùng',
            'Tài khoản đang chọn sẽ hiển thị badge "Đang chọn" và viền xanh',
            'Thông tin bạn bè, nhóm sẽ được tải về tự động',
            'Nhấn nút refresh (🔄) để làm mới dữ liệu tài khoản',
          ].map((step, i) => (
            <ListItem key={i} sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <CheckIcon fontSize="small" color="success" />
              </ListItemIcon>
              <ListItemText primary={step} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItem>
          ))}
        </List>

        <Alert severity="info" sx={{ mt: 2 }}>
          Trạng thái <b>"Sẵn sàng"</b> nghĩa là tài khoản đã có đầy đủ phiên đăng nhập. <b>"Chưa sẵn sàng"</b> cần đồng bộ lại.
        </Alert>
      </>
    ),
  },
  {
    id: 'reach',
    icon: <ReachIcon />,
    title: 'Tương Tác (Trang chính)',
    color: '#22c55e',
    content: (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Đây là trang chính để thực hiện các thao tác hàng loạt: nhắn tin, kết bạn, xóa bạn, rời nhóm...
        </Typography>

        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GroupIcon fontSize="small" /> Chọn đối tượng (bên phải)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Bên phải màn hình có các tab để chọn đối tượng tác động:
          </Typography>
          <List dense>
            {[
              { label: 'Bạn bè', desc: 'Danh sách bạn bè Zalo — lọc theo tên, SĐT, phân loại' },
              { label: 'Nhóm', desc: 'Nhóm đang tham gia — chọn nhóm để gửi tin hoặc trích xuất thành viên' },
              { label: 'Thư viện nhóm', desc: 'Nhóm từ nguồn bên ngoài để import' },
              { label: 'SĐT/ZID', desc: 'Nhập thủ công số điện thoại hoặc Zalo ID' },
              { label: 'Lời mời đã gửi', desc: 'Lời mời kết bạn đang chờ — có thể rút lại' },
              { label: 'Lời mời kết bạn', desc: 'Lời mời nhận được — chấp nhận hoặc từ chối' },
            ].map((tab, i) => (
              <ListItem key={i} sx={{ py: 0.25 }}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Chip label={tab.label} size="small" sx={{ fontSize: '0.7rem', height: 22 }} />
                </ListItemIcon>
                <ListItemText primary={tab.desc} primaryTypographyProps={{ variant: 'body2' }} />
              </ListItem>
            ))}
          </List>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon fontSize="small" /> Cấu hình hành động (bên trái)
          </Typography>
          <List dense>
            {[
              { label: 'Kết bạn', desc: 'Bật/tắt gửi lời mời kết bạn — nhập lời mời (tối đa 150 ký tự)' },
              { label: 'Nhắn tin', desc: 'Bật/tắt gửi tin nhắn hàng loạt — nhập nội dung tin nhắn' },
              { label: 'Đính kèm', desc: 'Kéo thả hoặc chọn ảnh/video/file để gửi kèm tin nhắn' },
              { label: 'Cách nhau', desc: 'Thời gian chờ giữa mỗi lần gửi (Từ X đến Y giây)' },
              { label: 'Spam', desc: 'Bật/tắt chống spam — giảm tốc để tránh bị Zalo khóa' },
            ].map((item, i) => (
              <ListItem key={i} sx={{ py: 0.25 }}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <CheckIcon fontSize="small" color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary={<><b>{item.label}:</b> {item.desc}</>}
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </ListItem>
            ))}
          </List>
        </Paper>

        <Typography variant="subtitle2" gutterBottom>Quy trình thực hiện:</Typography>
        <List dense>
          {[
            'Chọn đối tượng từ các tab bên phải (tick checkbox)',
            'Bật toggle Kết bạn và/hoặc Nhắn tin bên trái',
            'Nhập nội dung lời mời / tin nhắn',
            'Cấu hình thời gian cách nhau (khuyến nghị 60-120 giây)',
            'Nhấn nút "Bắt Đầu" để chạy',
            'Theo dõi tiến trình ở phần "Hoạt động gần đây" bên dưới',
          ].map((step, i) => (
            <ListItem key={i} sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Chip label={i + 1} size="small" color="success" sx={{ width: 24, height: 24, fontSize: '0.75rem', fontWeight: 700 }} />
              </ListItemIcon>
              <ListItemText primary={step} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItem>
          ))}
        </List>
      </>
    ),
  },
  {
    id: 'ai',
    icon: <AIIcon />,
    title: 'Tính năng AI',
    color: '#8b5cf6',
    badge: 'PLUS',
    content: (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Gói PLUS trở lên có thể sử dụng AI để viết lại tin nhắn và lời mời kết bạn tự động.
        </Typography>
        <List dense>
          {[
            'Nhấn nút "AI viết lại" (💫) bên dưới ô tin nhắn hoặc lời mời',
            'AI sẽ tạo 3 phiên bản khác nhau của nội dung',
            'Chọn phiên bản ưng ý nhất để sử dụng',
            'Có thể chỉnh sửa thêm sau khi AI tạo nội dung',
          ].map((step, i) => (
            <ListItem key={i} sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <AIIcon fontSize="small" sx={{ color: '#8b5cf6' }} />
              </ListItemIcon>
              <ListItemText primary={step} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItem>
          ))}
        </List>
        <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Tin nhắn nhanh</Typography>
          <Typography variant="body2" color="text.secondary">
            Nhấn "Tin nhắn nhanh" (⚡) để chọn từ các mẫu tin nhắn có sẵn, giúp soạn nội dung nhanh hơn.
          </Typography>
        </Paper>
      </>
    ),
  },
  {
    id: 'messages',
    icon: <ChatIcon />,
    title: 'Quản lý tin nhắn',
    color: '#f59e0b',
    content: (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Trang "Quản Lý Tin Nhắn" hiển thị toàn bộ hội thoại Zalo theo thời gian thực.
        </Typography>

        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Tổng quan</Typography>
          <List dense>
            {[
              'Tổng hội thoại: Số cuộc hội thoại đã đồng bộ',
              'Chưa đọc: Số tin nhắn chưa đọc',
              'Cá nhân: Số hội thoại 1-1',
              'Nhóm: Số hội thoại nhóm',
            ].map((item, i) => (
              <ListItem key={i} sx={{ py: 0.25 }}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <CheckIcon fontSize="small" sx={{ color: '#f59e0b' }} />
                </ListItemIcon>
                <ListItemText primary={item} primaryTypographyProps={{ variant: 'body2' }} />
              </ListItem>
            ))}
          </List>
        </Paper>

        <Typography variant="subtitle2" gutterBottom>Cách sử dụng:</Typography>
        <List dense>
          {[
            'Mở trang "Quản Lý Tin Nhắn" trên sidebar',
            'Hội thoại tự đồng bộ khi tài khoản đã sẵn sàng',
            'Nhấn "Đồng bộ ngay" để cập nhật thủ công',
            'Nhấn vào hội thoại bên trái để xem chi tiết bên phải',
            'Tin nhắn mới sẽ tự cập nhật mỗi 15 giây',
            'Hội thoại có tin mới sẽ tự động lên đầu danh sách',
          ].map((step, i) => (
            <ListItem key={i} sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Chip label={i + 1} size="small" sx={{ width: 24, height: 24, fontSize: '0.75rem', fontWeight: 700, bgcolor: '#f59e0b', color: '#fff' }} />
              </ListItemIcon>
              <ListItemText primary={step} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItem>
          ))}
        </List>
      </>
    ),
  },
  {
    id: 'collections',
    icon: <StarIcon />,
    title: 'Phân loại liên hệ',
    color: '#ec4899',
    badge: 'PLUS',
    content: (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Phân loại bạn bè Zalo thành các nhóm để dễ quản lý và nhắm mục tiêu chiến dịch.
        </Typography>
        <Stack spacing={1}>
          {[
            { color: '#ef4444', label: 'Khách hàng' },
            { color: '#8b5cf6', label: 'Gia đình' },
            { color: '#f97316', label: 'Công việc' },
            { color: '#eab308', label: 'Bạn bè' },
            { color: '#22c55e', label: 'Trả lời sau' },
            { color: '#3b82f6', label: 'Đồng nghiệp' },
          ].map((cat, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: cat.color }} />
              <Typography variant="body2">{cat.label}</Typography>
            </Box>
          ))}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Chọn phân loại cho mỗi liên hệ từ dropdown bên phải tên. Sau đó dùng bộ lọc "Tìm theo thẻ phân loại" để lọc nhanh.
        </Typography>
      </>
    ),
  },
  {
    id: 'schedule',
    icon: <ScheduleIcon />,
    title: 'Hẹn giờ gửi',
    color: '#06b6d4',
    content: (
      <>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Lên lịch gửi tin nhắn hoặc kết bạn vào thời điểm cụ thể.
        </Typography>
        <List dense>
          {[
            'Cấu hình nội dung và chọn đối tượng như bình thường',
            'Nhấn biểu tượng lịch (📅) thay vì nhấn "Bắt Đầu"',
            'Chọn ngày giờ muốn thực hiện',
            'Chiến dịch sẽ tự chạy khi đến giờ (cần giữ trang web mở)',
          ].map((step, i) => (
            <ListItem key={i} sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Chip label={i + 1} size="small" sx={{ width: 24, height: 24, fontSize: '0.75rem', fontWeight: 700, bgcolor: '#06b6d4', color: '#fff' }} />
              </ListItemIcon>
              <ListItemText primary={step} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItem>
          ))}
        </List>
        <Alert severity="warning" sx={{ mt: 2 }}>
          Trang web và extension phải đang hoạt động khi đến giờ hẹn. Nếu đóng trình duyệt, lịch hẹn sẽ không chạy.
        </Alert>
      </>
    ),
  },
  {
    id: 'antispam',
    icon: <SpeedIcon />,
    title: 'Chống spam & bảo vệ tài khoản',
    color: '#64748b',
    content: (
      <>
        <Alert severity="error" sx={{ mb: 2 }}>
          <b>Quan trọng:</b> Zalo sẽ khóa tài khoản nếu phát hiện spam. Hãy tuân thủ các khuyến nghị bên dưới.
        </Alert>
        <List dense>
          {[
            'Luôn bật toggle "Spam" (chống spam) khi gửi hàng loạt',
            'Đặt thời gian cách nhau tối thiểu 60 giây, khuyến nghị 60-120 giây',
            'Không gửi quá 50 tin nhắn/ngày cho tài khoản mới',
            'Tài khoản cũ (>1 năm) có thể gửi 100-200 tin/ngày',
            'Nội dung tin nhắn nên đa dạng — dùng AI viết lại để tránh trùng lặp',
            'Tránh gửi link lạ hoặc nội dung quảng cáo trực tiếp',
            'Nếu bị cảnh báo, dừng gửi ít nhất 24h trước khi tiếp tục',
          ].map((tip, i) => (
            <ListItem key={i} sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <WarningIcon fontSize="small" sx={{ color: '#f59e0b' }} />
              </ListItemIcon>
              <ListItemText primary={tip} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItem>
          ))}
        </List>
      </>
    ),
  },
];

export default function GuidePage() {
  const [expanded, setExpanded] = useState('install');

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', py: 4, px: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
        Hướng Dẫn Sử Dụng
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        AutoZalo v1.0.0 — Công cụ quản lý Zalo đa tài khoản
      </Typography>
      <Chip label="v1.0.0" size="small" sx={{ mb: 4, fontWeight: 600 }} />

      <Stack spacing={1.5}>
        {SECTIONS.map((section) => (
          <Accordion
            key={section.id}
            expanded={expanded === section.id}
            onChange={(_, isExpanded) => setExpanded(isExpanded ? section.id : false)}
            elevation={0}
            disableGutters
            sx={{
              border: '1px solid',
              borderColor: expanded === section.id ? section.color + '44' : 'divider',
              borderRadius: '12px !important',
              '&::before': { display: 'none' },
              overflow: 'hidden',
              transition: 'border-color 0.2s',
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                px: 3,
                '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1.5, my: 1.5 },
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '10px',
                  bgcolor: section.color + '14',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: section.color,
                  flexShrink: 0,
                }}
              >
                {section.icon}
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {section.title}
              </Typography>
              {section.badge && (
                <Chip
                  label={section.badge}
                  size="small"
                  sx={{
                    fontSize: '0.65rem',
                    height: 20,
                    fontWeight: 700,
                    bgcolor: '#0068FF',
                    color: '#fff',
                  }}
                />
              )}
            </AccordionSummary>
            <AccordionDetails sx={{ px: 3, pb: 3 }}>
              {section.content}
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>

      <Paper
        variant="outlined"
        sx={{ mt: 4, p: 3, borderRadius: 3, bgcolor: '#f8fafc' }}
      >
        <Typography variant="subtitle2" gutterBottom>
          Cần hỗ trợ thêm?
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Liên hệ qua{' '}
          <Box
            component="a"
            href="https://autozalo.vn"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 600 }}
          >
            autozalo.vn
          </Box>
          {' '}để được hỗ trợ trực tiếp.
        </Typography>
      </Paper>
    </Box>
  );
}
