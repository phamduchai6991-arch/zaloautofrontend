import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrowUpward as SortIcon,
  CollectionsBookmark as LibraryIcon,
  Delete as DeleteIcon,
  Group as GroupIcon,
  Mail as MailIcon,
  MoreHoriz as MoreHorizIcon,
  People as PeopleIcon,
  PersonAdd as PersonAddIcon,
  Phone as PhoneIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useAccount } from '../contexts/AccountContext';
import {
  normalizeFriendRow,
  normalizeGroupRow,
  normalizeReceivedFriendRequestRow,
  normalizeSentFriendRequestRow,
} from '../utils/zaloDataTransforms';
import {
  applyActionToggle,
  getControlKind,
  getControlLabel,
  getTabControlRows,
  LOCAL_VIEW_DEFAULTS,
  TAB_SEARCH_PLACEHOLDERS,
  TABS_WITH_COLLECTION_FILTER,
} from '../utils/reachActionConfig';
import {
  getHiddenContactIds,
  subscribeHiddenContactsChange,
} from '../utils/reachVisibilityStore';
import {
  loadGroupLibraryEntries,
  subscribeGroupLibraryChange,
} from '../utils/reachGroupLibraryStore';

const FRIEND_COLLECTIONS_KEY = 'zt_friend_collections';
const GROUP_COLLECTIONS_KEY = 'zt_group_collections';
const DEFAULT_FRIEND_COLLECTION = 'Chưa phân loại';
const FRIEND_COLLECTION_OPTIONS = [
  { value: 'Khách hàng', color: '#e02424' },
  { value: 'Gia đình', color: '#df2de0' },
  { value: 'Công việc', color: '#ff6a00' },
  { value: 'Bạn bè', color: '#fbbc05' },
  { value: 'Trả lời sau', color: '#55c77b' },
  { value: 'Đồng nghiệp', color: '#1d6cf2' },
];

function loadStoredCollections(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function findCollectionOption(value) {
  return FRIEND_COLLECTION_OPTIONS.find((option) => option.value === value) || null;
}

function normalizeCollection(value) {
  if (!value) return DEFAULT_FRIEND_COLLECTION;
  if (findCollectionOption(value)) return value;
  if (value === 'Đối tác') return 'Công việc';
  if (value === 'Khách hàng') return 'Khách hàng';
  if (value === 'Bạn bè') return 'Bạn bè';
  return DEFAULT_FRIEND_COLLECTION;
}

function buildRowKey(row, idx) {
  return String(row?.key || row?.zid || row?.name || `row_${idx}`);
}

function CollectionPill({ value, muted = false }) {
  const option = findCollectionOption(value);

  if (!option) {
    return (
      <Box sx={{ color: muted ? '#9aa5b1' : '#4b5563', fontWeight: 500 }}>
        {DEFAULT_FRIEND_COLLECTION}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box
        sx={{
          width: 18,
          height: 14,
          bgcolor: option.color,
          clipPath: 'polygon(0 10%, 74% 10%, 100% 50%, 74% 90%, 0 90%)',
          borderRadius: '3px',
          flexShrink: 0,
        }}
      />
      <Box sx={{ color: muted ? '#9aa5b1' : '#24303f', fontWeight: 500 }}>
        {option.value}
      </Box>
    </Box>
  );
}

const DATA_TABS = [
  { label: 'Bạn bè', icon: <PeopleIcon fontSize="small" /> },
  { label: 'Nhóm', icon: <GroupIcon fontSize="small" /> },
  { label: 'Thư viện nhóm', icon: <LibraryIcon fontSize="small" /> },
  { label: 'SĐT/ZID', icon: <PhoneIcon fontSize="small" /> },
  { label: 'Lời mời đã gửi', icon: <PersonAddIcon fontSize="small" /> },
  { label: 'Lời mời kết bạn', icon: <MailIcon fontSize="small" /> },
];

export default function RightColumn({ campaignState, actionState, onActionStateChange, onSelectionChange }) {
  const { friends, groups, activeAccount, sentFriendRequests, receivedFriendRequests } = useAccount();
  const [locTrung, setLocTrung] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [friendCollections, setFriendCollections] = useState(() => loadStoredCollections(FRIEND_COLLECTIONS_KEY));
  const [groupCollections, setGroupCollections] = useState(() => loadStoredCollections(GROUP_COLLECTIONS_KEY));
  const [groupLibraryEntries, setGroupLibraryEntries] = useState(() => loadGroupLibraryEntries());
  const [viewState, setViewState] = useState(LOCAL_VIEW_DEFAULTS);
  const [hiddenContactIds, setHiddenContactIds] = useState(new Set());
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(10);
  const [manualPhoneInput, setManualPhoneInput] = useState('');
  const [manualEntries, setManualEntries] = useState(() => {
    try {
      const raw = localStorage.getItem('zt_manual_phones');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const activeAccountId = String(activeAccount?.id || activeAccount?.userId || '');
  const accountFriendCollections = activeAccountId && friendCollections[activeAccountId]
    ? friendCollections[activeAccountId]
    : {};
  const accountGroupCollections = activeAccountId && groupCollections[activeAccountId]
    ? groupCollections[activeAccountId]
    : {};

  useEffect(() => {
    try {
      localStorage.setItem(FRIEND_COLLECTIONS_KEY, JSON.stringify(friendCollections));
    } catch {
      // Ignore storage quota failures.
    }
  }, [friendCollections]);

  useEffect(() => {
    try {
      localStorage.setItem(GROUP_COLLECTIONS_KEY, JSON.stringify(groupCollections));
    } catch {
      // Ignore storage quota failures.
    }
  }, [groupCollections]);

  useEffect(() => {
    setHiddenContactIds(getHiddenContactIds(activeAccountId));
    return subscribeHiddenContactsChange(() => {
      setHiddenContactIds(getHiddenContactIds(activeAccountId));
    });
  }, [activeAccountId]);

  useEffect(() => subscribeGroupLibraryChange((entries) => {
    setGroupLibraryEntries(Array.isArray(entries) ? entries : loadGroupLibraryEntries());
  }), []);

  const updateActionState = (patch) => {
    onActionStateChange?.({
      ...(actionState || {}),
      ...patch,
    });
  };

  const dedupeRows = (rows) => {
    if (!viewState.dedupeRows) return rows;
    const seen = new Set();
    return rows.filter((row) => {
      const key = row.key || row.zid || row.name;
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const handleCollectionChange = (rowKey, nextValue) => {
    if (!activeAccountId || !rowKey) return;

    setFriendCollections((prev) => {
      const current = prev[activeAccountId] && typeof prev[activeAccountId] === 'object'
        ? prev[activeAccountId]
        : {};
      const normalizedValue = normalizeCollection(nextValue);
      const nextAccountCollections = { ...current };

      if (normalizedValue === DEFAULT_FRIEND_COLLECTION) {
        delete nextAccountCollections[rowKey];
      } else {
        nextAccountCollections[rowKey] = normalizedValue;
      }

      if (Object.keys(nextAccountCollections).length === 0) {
        const nextCollections = { ...prev };
        delete nextCollections[activeAccountId];
        return nextCollections;
      }

      return {
        ...prev,
        [activeAccountId]: nextAccountCollections,
      };
    });
  };

  const handleGroupCollectionChange = (rowKey, nextValue) => {
    if (!activeAccountId || !rowKey) return;

    setGroupCollections((prev) => {
      const current = prev[activeAccountId] && typeof prev[activeAccountId] === 'object'
        ? prev[activeAccountId]
        : {};
      const normalizedValue = normalizeCollection(nextValue);
      const nextAccountCollections = { ...current };

      if (normalizedValue === DEFAULT_FRIEND_COLLECTION) {
        delete nextAccountCollections[rowKey];
      } else {
        nextAccountCollections[rowKey] = normalizedValue;
      }

      if (Object.keys(nextAccountCollections).length === 0) {
        const nextCollections = { ...prev };
        delete nextCollections[activeAccountId];
        return nextCollections;
      }

      return {
        ...prev,
        [activeAccountId]: nextAccountCollections,
      };
    });
  };

  const filteredFriendRows = dedupeRows(
    friends
      .map(normalizeFriendRow)
      .map((friend, idx) => {
        const rowKey = buildRowKey(friend, idx);
        const storedCollection = accountFriendCollections[rowKey];
        return {
          ...friend,
          rowKey,
          classification: normalizeCollection(storedCollection || friend.classification),
        };
      })
      .filter((friend) => {
        if (selectedTag && friend.classification !== selectedTag) return false;
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return friend.name.toLowerCase().includes(q)
          || String(friend.phone).toLowerCase().includes(q)
          || String(friend.zid).toLowerCase().includes(q);
      })
  );

  const filteredGroupRows = dedupeRows(
    groups
      .map(normalizeGroupRow)
      .map((group, idx) => {
        const rowKey = buildRowKey(group, idx);
        const storedCollection = accountGroupCollections[rowKey];
        return {
          ...group,
          rowKey,
          classification: normalizeCollection(storedCollection || group.classification),
        };
      })
      .filter((group) => {
        if (!viewState.showHiddenMembers && group.isHiddenConversation) return false;
        if (selectedTag && group.classification !== selectedTag) return false;
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return group.name.toLowerCase().includes(q)
          || String(group.classification).toLowerCase().includes(q)
          || String(group.source?.inviteLink || '').toLowerCase().includes(q)
          || String(group.zid).toLowerCase().includes(q);
      })
  );

  const inviteQueueRows = dedupeRows(
    sentFriendRequests
      .map(normalizeSentFriendRequestRow)
      .filter((job) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return job.name.toLowerCase().includes(q)
          || String(job.phone).toLowerCase().includes(q)
          || String(job.zid).toLowerCase().includes(q)
          || String(job.classification).toLowerCase().includes(q);
      })
  );

  const scheduledInviteRows = dedupeRows(
    receivedFriendRequests
      .map(normalizeReceivedFriendRequestRow)
      .filter((job) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return job.name.toLowerCase().includes(q)
          || String(job.phone).toLowerCase().includes(q)
          || String(job.zid).toLowerCase().includes(q)
          || String(job.classification).toLowerCase().includes(q);
      })
  );

  const contactRows = [
    ...manualEntries
      .filter((entry) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return String(entry.phone || '').includes(q) || String(entry.zid || '').includes(q);
      })
      .map((entry, idx) => ({
        key: `manual_${entry.phone || entry.zid || idx}`,
        rowKey: `manual_${entry.phone || entry.zid || idx}`,
        name: '',
        avatar: '',
        phone: entry.phone || '—',
        zid: entry.zid || entry.phone || '—',
        classification: entry.zid || entry.phone || '—',
        isManual: true,
      })),
    ...filteredFriendRows.map((friend) => ({
      ...friend,
      classification: friend.zid,
    })).filter((friend) => !hiddenContactIds.has(String(friend.zid || '').trim())),
  ];

  const groupLibraryRows = dedupeRows(
    groupLibraryEntries
      .map((group, idx) => ({
        key: group?.groupId || group?.zid || group?.inviteLink || `library_${idx}`,
        rowKey: String(group?.groupId || group?.zid || group?.inviteLink || `library_${idx}`),
        name: group?.name || 'Không rõ tên nhóm',
        avatar: group?.avatar || '',
        phone: group?.inviteLink || (group?.totalMember ? `${group.totalMember} thành viên` : '—'),
        classification: group?.description || 'Chưa có mô tả',
        zid: group?.groupId || group?.zid || '—',
        inviteLink: group?.inviteLink || '',
        isHiddenConversation: Boolean(group?.isHiddenConversation),
        source: group,
      }))
      .filter((group) => {
        if (!viewState.showHiddenMembers && group.isHiddenConversation) return false;
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return group.name.toLowerCase().includes(q)
          || String(group.phone).toLowerCase().includes(q)
          || String(group.classification).toLowerCase().includes(q)
          || String(group.zid).toLowerCase().includes(q);
      })
  );

  const tabRows = {
    0: filteredFriendRows,
    1: filteredGroupRows,
    2: groupLibraryRows,
    3: contactRows,
    4: inviteQueueRows,
    5: scheduledInviteRows,
  };

  const activeRows = tabRows[activeTab] || [];
  const activeCount = activeRows.length;
  const paginatedRows = activeRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const allRowsSelected = activeCount > 0 && activeRows.every((row, idx) => selectedRows.has(buildRowKey(row, idx)));
  const controlRows = getTabControlRows(activeTab);
  const showCollectionFilter = TABS_WITH_COLLECTION_FILTER.has(activeTab);
  const searchPlaceholder = TAB_SEARCH_PLACEHOLDERS[activeTab] || 'Tìm kiếm';

  const emptyStateByTab = {
    0: {
      title: activeAccount ? 'Không có bạn bè' : 'Không có dữ liệu',
      description: activeAccount ? 'Tài khoản hiện tại chưa đồng bộ được danh sách bạn bè.' : 'Hãy thêm tài khoản Zalo để bắt đầu đồng bộ dữ liệu.',
    },
    1: {
      title: activeAccount ? 'Không có nhóm' : 'Không có dữ liệu',
      description: activeAccount ? 'Tài khoản hiện tại chưa có dữ liệu nhóm.' : 'Hãy thêm tài khoản Zalo để bắt đầu đồng bộ dữ liệu.',
    },
    2: {
      title: activeAccount ? 'Chưa có thư viện nhóm' : 'Không có dữ liệu',
      description: 'Tab này dùng cho dữ liệu nhóm có link mời. Nếu chưa có dữ liệu, cần nạp link nhóm vào thư viện trước khi dùng chức năng tham gia nhóm.',
    },
    3: {
      title: activeAccount ? 'Không có SĐT/ZID' : 'Không có dữ liệu',
      description: 'Tab này đang hiển thị số điện thoại và ZID suy ra từ danh sách bạn bè đã đồng bộ.',
    },
    4: {
      title: activeAccount ? 'Lời mời đã gửi' : 'Không có dữ liệu',
      description: activeAccount ? 'Danh sách lời mời kết bạn đã gửi từ tài khoản hiện tại.' : 'Hãy thêm tài khoản Zalo để đồng bộ lời mời đã gửi.',
    },
    5: {
      title: activeAccount ? 'Lời mời kết bạn' : 'Không có dữ liệu',
      description: activeAccount ? 'Danh sách lời mời kết bạn nhận được từ tài khoản hiện tại.' : 'Hãy thêm tài khoản Zalo để đồng bộ lời mời kết bạn nhận được.',
    },
  };

  useEffect(() => {
    if (!onSelectionChange) return;
    onSelectionChange({
      activeTab,
      activeLabel: DATA_TABS[activeTab]?.label || 'Dữ liệu',
      allItems: activeRows,
      selectedItems: activeRows.filter((row, idx) => selectedRows.has(buildRowKey(row, idx))),
      viewState,
    });
  }, [activeTab, activeRows.length, selectedRows.size, viewState, onSelectionChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedRows(new Set(activeRows.map((row, idx) => buildRowKey(row, idx))));
    } else {
      setSelectedRows(new Set());
    }
  };

  const addManualEntry = () => {
    const raw = manualPhoneInput.trim();
    if (!raw) return;
    const lines = raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const existing = new Set(manualEntries.map((e) => e.phone));
    const newEntries = lines.filter((l) => !existing.has(l)).map((phone) => ({ phone, zid: phone }));
    if (newEntries.length === 0) return;
    const updated = [...newEntries, ...manualEntries];
    setManualEntries(updated);
    try { localStorage.setItem('zt_manual_phones', JSON.stringify(updated)); } catch {}
    setManualPhoneInput('');
  };

  const removeManualEntries = () => {
    const updated = manualEntries.filter((entry) => !selectedRows.has(`manual_${entry.phone || entry.zid}`));
    setManualEntries(updated);
    try { localStorage.setItem('zt_manual_phones', JSON.stringify(updated)); } catch {}
    setSelectedRows(new Set());
  };

  const handleSelectRow = (row, idx) => {
    const rowKey = buildRowKey(row, idx);
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="body2" fontWeight={600}>
          Bộ sưu tập:
        </Typography>
        <IconButton size="small" sx={{ bgcolor: '#e3f2fd', width: 28, height: 28 }}>
          <MoreHorizIcon fontSize="small" sx={{ color: '#637381' }} />
        </IconButton>
      </Box>

      <Box sx={{ mb: 3 }}>
        {controlRows.map((row, rowIndex) => (
          <Box key={`control_row_${rowIndex}`} sx={{ display: 'flex', gap: 3, mb: rowIndex === controlRows.length - 1 ? 0 : 1.5, flexWrap: 'wrap' }}>
            {row.map((controlKey) => {
              const isLocal = getControlKind(controlKey) === 'local';
              const checked = isLocal ? Boolean(viewState[controlKey]) : Boolean(actionState?.[controlKey]);

              const handleChange = (checkedValue) => {
                if (isLocal) {
                  setViewState((prev) => ({ ...prev, [controlKey]: checkedValue }));
                  return;
                }

                updateActionState(applyActionToggle(actionState, controlKey, checkedValue));
              };

              return (
                <Box key={controlKey} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body1" fontWeight={600}>
                    {getControlLabel(controlKey)}
                  </Typography>
                  <Switch
                    checked={checked}
                    onChange={(event) => handleChange(event.target.checked)}
                    size="small"
                  />
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>

      <Tabs
        value={activeTab}
        onChange={(_, value) => {
          setActiveTab(value);
          setSelectedRows(new Set());
          setPage(0);
          if (value !== 0 && value !== 1) setSelectedTag('');
        }}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 48,
          mb: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          '& .MuiTab-root': {
            minHeight: 48,
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.8rem',
            px: 1,
            minWidth: 'auto',
            whiteSpace: 'normal',
            lineHeight: 1.3,
            textAlign: 'center',
          },
        }}
      >
        {DATA_TABS.map((tab, idx) => (
          <Tab key={idx} label={tab.label} />
        ))}
      </Tabs>

      {showCollectionFilter && (
        <FormControl size="small" fullWidth sx={{ mb: 2 }}>
          <Select
            value={selectedTag}
            displayEmpty
            onChange={(event) => setSelectedTag(event.target.value)}
            renderValue={(value) => {
              if (!value) {
                return <Box sx={{ color: '#9aa5b1' }}>Tìm theo thẻ phân loại</Box>;
              }
              return <CollectionPill value={value} />;
            }}
            sx={{
              borderRadius: 3,
              bgcolor: '#fff',
              '& .MuiSelect-select': {
                py: 1.4,
              },
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  mt: 1,
                  borderRadius: 3,
                  p: 1,
                },
              },
            }}
          >
            <MenuItem value="">
              <Box sx={{ color: '#9aa5b1' }}>Tất cả phân loại</Box>
            </MenuItem>
            {FRIEND_COLLECTION_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                <CollectionPill value={option.value} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {(activeTab === 4 || activeTab === 5) && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {emptyStateByTab[activeTab].description}
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Checkbox
          size="small"
          checked={allRowsSelected}
          onChange={(e) => handleSelectAll(e.target.checked)}
        />
        <Typography variant="caption" fontWeight={600}>
          {activeCount}
        </Typography>
        <TextField
          size="small"
          placeholder={activeTab === 3 ? 'Tìm theo số điện thoại/ZID' : searchPlaceholder}
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ flex: 1, ml: 1, '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.8 } }}
        />
        {activeTab === 3 && (
          <>
            <Button size="small" variant="outlined" onClick={addManualEntry} sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 52, py: 0.5 }}>
              Thêm
            </Button>
            <Button size="small" variant="outlined" color="error" onClick={removeManualEntries} disabled={selectedRows.size === 0}
              sx={{ textTransform: 'none', fontSize: '0.75rem', minWidth: 44, py: 0.5 }}>
              Xóa
            </Button>
          </>
        )}
      </Box>

      {activeTab === 3 && (
        <TextField
          size="small"
          multiline
          minRows={2}
          maxRows={4}
          placeholder="Nhập số điện thoại hoặc ZID (mỗi dòng 1 số, hoặc ngăn bằng dấu phẩy)"
          value={manualPhoneInput}
          onChange={(e) => setManualPhoneInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addManualEntry(); } }}
          fullWidth
          sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
        />
      )}

      <TableContainer>
        <Table size="small" sx={{ '& .MuiTableCell-root': { py: 0.5, px: 1, fontSize: '0.78rem' } }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>
                Tên
                <SortIcon fontSize="inherit" sx={{ ml: 0.5, verticalAlign: 'middle', opacity: 0.5 }} />
              </TableCell>
              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>
                {activeTab === 1 ? 'Thành viên' : activeTab === 2 ? 'Thông tin' : activeTab === 3 ? 'Số điện thoại/ Zalo ID' : activeTab === 4 || activeTab === 5 ? 'Thời gian' : 'Số điện thoại'}
              </TableCell>
              {activeTab !== 3 && (
                <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem' }}>
                  {activeTab === 2 ? 'Mô tả' : activeTab === 4 || activeTab === 5 ? 'Nội dung' : 'Phân loại'}
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedRows.map((row, idx) => {
              const globalIdx = page * rowsPerPage + idx;
              return (
              <TableRow key={buildRowKey(row, globalIdx)} hover selected={selectedRows.has(buildRowKey(row, globalIdx))}>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={selectedRows.has(buildRowKey(row, globalIdx))}
                    onChange={() => handleSelectRow(row, globalIdx)}
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {row.name ? (
                      <>
                        <Avatar src={row.avatar} sx={{ width: 24, height: 24, fontSize: '0.7rem' }}>
                          {(row.name || '?')[0]}
                        </Avatar>
                        <Typography variant="caption">{row.name}</Typography>
                      </>
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {activeTab === 3 ? (row.phone || row.zid || '—') : (row.phone || '—')}
                  </Typography>
                </TableCell>
                {activeTab !== 3 && (
                <TableCell>
                  {activeTab === 0 ? (
                    <FormControl size="small" fullWidth>
                      <Select
                        value={normalizeCollection(row.classification)}
                        onChange={(event) => handleCollectionChange(row.rowKey || buildRowKey(row, globalIdx), event.target.value)}
                        displayEmpty
                        renderValue={(value) => <CollectionPill value={value} muted={value === DEFAULT_FRIEND_COLLECTION} />}
                        sx={{
                          minWidth: 140,
                          borderRadius: 2,
                          bgcolor: '#fff',
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#d8e0ea' },
                          '& .MuiSelect-select': { py: 0.5, fontSize: '0.78rem' },
                        }}
                        MenuProps={{ PaperProps: { sx: { mt: 1, borderRadius: 2, p: 0.5 } } }}
                      >
                        <MenuItem value={DEFAULT_FRIEND_COLLECTION}>
                          <CollectionPill value={DEFAULT_FRIEND_COLLECTION} muted />
                        </MenuItem>
                        {FRIEND_COLLECTION_OPTIONS.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            <CollectionPill value={option.value} />
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : activeTab === 1 ? (
                    <FormControl size="small" fullWidth>
                      <Select
                        value={normalizeCollection(row.classification)}
                        onChange={(event) => handleGroupCollectionChange(row.rowKey || buildRowKey(row, globalIdx), event.target.value)}
                        displayEmpty
                        renderValue={(value) => <CollectionPill value={value} muted={value === DEFAULT_FRIEND_COLLECTION} />}
                        sx={{
                          minWidth: 140,
                          borderRadius: 2,
                          bgcolor: '#fff',
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#d8e0ea' },
                          '& .MuiSelect-select': { py: 0.5, fontSize: '0.78rem' },
                        }}
                        MenuProps={{ PaperProps: { sx: { mt: 1, borderRadius: 2, p: 0.5 } } }}
                      >
                        <MenuItem value={DEFAULT_FRIEND_COLLECTION}>
                          <CollectionPill value={DEFAULT_FRIEND_COLLECTION} muted />
                        </MenuItem>
                        {FRIEND_COLLECTION_OPTIONS.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            <CollectionPill value={option.value} />
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : activeTab === 2 ? (
                    <Typography variant="caption" color="text.secondary">
                      {row.classification || '—'}
                    </Typography>
                  ) : (
                    <Chip label={row.classification || 'Chưa phân loại'} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 22 }} />
                  )}
                </TableCell>
                )}
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {activeCount > rowsPerPage && (
        <TablePagination
          component="div"
          count={activeCount}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
          sx={{ '& .MuiTablePagination-toolbar': { minHeight: 36, px: 1 }, '& .MuiTablePagination-displayedRows': { fontSize: '0.75rem' } }}
        />
      )}

      {activeCount === 0 && (
        <Box
          sx={{
            py: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Box
            component="img"
            src="/illustration_empty_content.svg"
            alt="empty content"
            onError={(event) => { event.target.style.display = 'none'; }}
            sx={{ width: 200, height: 200, opacity: 0.8 }}
          />
          <Typography variant="subtitle1" fontWeight={700} color="text.secondary">
            {emptyStateByTab[activeTab]?.title || (activeAccount ? 'Đang tải dữ liệu...' : 'Không có dữ liệu')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 320 }}>
            {emptyStateByTab[activeTab]?.description || 'Chưa có dữ liệu để hiển thị.'}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
