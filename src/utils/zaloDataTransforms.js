function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

export function normalizeConversationId(value, isGroup = false) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (isGroup && text.toLowerCase().startsWith('g')) {
    return text.slice(1);
  }
  return text;
}

export function extractPhoneNumber(value) {
  if (!value) return '';
  const match = String(value).match(/(?:\+?84|0)\d{8,10}/);
  return match ? match[0] : '';
}

export function classifyFriend(friend, extractedPhone) {
  if (friend?.bizInfo?.pkgId || friend?.bizInfo?.label) return 'Đối tác';
  if (extractedPhone) return 'Khách hàng';
  return 'Bạn bè';
}

export function normalizeFriendRow(friend) {
  const phone = friend?.phoneNumber || friend?.phone || extractPhoneNumber(friend?.status);
  return {
    key: friend?.userId || friend?.globalId || friend?.username,
    name: friend?.displayName || friend?.zaloName || friend?.name || 'Không rõ tên',
    avatar: friend?.avatar || '',
    phone: phone || '—',
    classification: classifyFriend(friend, phone) || 'Chưa phân loại',
    zid: friend?.userId || friend?.username || '—',
    source: friend,
  };
}

export function normalizeGroupRow(group) {
  return {
    key: group?.userId || group?.globalId,
    name: group?.displayName || 'Không rõ tên nhóm',
    avatar: group?.avatar || '',
    phone: `${group?.totalMember || 0} thành viên`,
    classification: group?.desc || 'Nhóm',
    zid: group?.userId || '—',
    isHiddenConversation: Boolean(group?.isHiddenConversation),
    source: group,
  };
}

export function normalizeSentFriendRequestRow(request) {
  return {
    key: request?.userId || request?.globalId,
    name: request?.displayName || request?.zaloName || 'Không rõ tên',
    avatar: request?.avatar || '',
    phone: request?.requestedAt ? new Date(request.requestedAt).toLocaleString('vi-VN') : '—',
    classification: request?.message || 'Đã gửi lời mời',
    zid: request?.userId || '—',
    source: request,
  };
}

export function normalizeReceivedFriendRequestRow(request) {
  return {
    key: request?.userId || request?.zid,
    name: request?.displayName || request?.zaloName || 'Không rõ tên',
    avatar: request?.avatar || '',
    phone: request?.recommTime
      ? new Date(request.recommTime).toLocaleString('vi-VN')
      : (request?.phoneNumber || '—'),
    classification: request?.message || request?.status || 'Lời mời kết bạn',
    zid: request?.userId || '—',
    source: request,
  };
}

function addKeys(map, values, item) {
  values.forEach((value) => {
    const key = String(value || '').trim();
    if (!key || map.has(key)) return;
    map.set(key, item);
  });
}

export function buildFriendMap(friends) {
  const map = new Map();
  (Array.isArray(friends) ? friends : []).forEach((friend) => {
    addKeys(map, [
      normalizeConversationId(friend?.userId),
      normalizeConversationId(friend?.globalId),
      normalizeConversationId(friend?.username),
      normalizeConversationId(friend?.phoneNumber),
    ], friend);
  });
  return map;
}

export function buildGroupMap(groups) {
  const map = new Map();
  (Array.isArray(groups) ? groups : []).forEach((group) => {
    const normalizedId = normalizeConversationId(group?.userId, true);
    addKeys(map, [
      normalizedId,
      normalizedId ? `g${normalizedId}` : '',
      normalizeConversationId(group?.globalId),
      normalizeConversationId(group?.displayName),
    ], group);
  });
  return map;
}

export function enrichConversation(conversation, friendMap, groupMap) {
  const isGroup = Boolean(conversation?.isGroup);
  const normalizedId = normalizeConversationId(
    conversation?.id || conversation?.groupId || conversation?.userId,
    isGroup,
  );

  const fallback = isGroup
    ? groupMap.get(normalizedId) || groupMap.get(`g${normalizedId}`)
    : friendMap.get(normalizedId);

  return {
    ...conversation,
    id: normalizedId || conversation?.id || '',
    displayName: firstNonEmpty(
      conversation?.displayName,
      fallback?.displayName,
      fallback?.zaloName,
      fallback?.username,
    ) || 'Không rõ tên',
    avatar: firstNonEmpty(conversation?.avatar, fallback?.avatar),
    memberCount: conversation?.memberCount || fallback?.totalMember || 0,
  };
}