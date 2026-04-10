import { getZaloCommonData, zFetch } from './extensionBridge';

function isGroupLabel(label) {
  const value = String(label || '').toLowerCase();
  return value.includes('nhom') || value.includes('nhóm') || value === 'group' || value === 'groups';
}

function buildClientId(account, job) {
  const accountId = String(account?.id || 'acct').slice(-12);
  const jobId = String(job?.id || 'job').slice(-18);
  return `${Date.now()}_${accountId}_${jobId}`;
}

export function hasSessionSnapshot(account) {
  return Boolean(account && account.imei);
}

export function normalizeSessionSnapshot(data) {
  const session = data?.session || data || {};
  return {
    imei: session.imei || '',
    decryptKey: session.decryptKey || '',
    commonParams: session.commonParams || '',
    labelVersion: session.labelVersion || null,
    commonData: session.commonData || null,
    userId: session.userId || '',
    UIN: session.UIN || '',
    sessionSource: Array.isArray(session.sessionSource) ? session.sessionSource : [],
    syncedAt: new Date().toISOString(),
  };
}

export function buildSendTextMessageRequest(account, job) {
  return {
    method: 'sendZText',
    args: {
      toId: job.zid,
      message: String(job.content || '').trim(),
      isGroup: Boolean(job.isGroup) || isGroupLabel(job.sourceTab),
      clientId: buildClientId(account, job),
      session: normalizeSessionSnapshot(account),
    },
    meta: {
      job: {
        id: job.id,
        name: job.name,
        phone: job.phone,
        zid: job.zid,
        content: String(job.content || '').trim(),
        sourceTab: job.sourceTab,
      },
    },
  };
}

export function buildSendFriendRequestRequest(account, job) {
  return {
    method: 'sendFriendRequest',
    args: {
      userId: job.zid,
      message: String(job.note || '').trim(),
      session: normalizeSessionSnapshot(account),
    },
    meta: {
      job: {
        id: job.id,
        name: job.name,
        phone: job.phone,
        zid: job.zid,
        note: String(job.note || '').trim(),
      },
    },
  };
}

export async function syncZaloCommonData(account) {
  const response = await getZaloCommonData({ account });
  if (!response?.ok) {
    throw new Error(response?.error || 'Không thể đồng bộ session Zalo hiện tại.');
  }
  return normalizeSessionSnapshot(response.data || {});
}

export async function sendTextMessageRequest(account, job) {
  const response = await zFetch({
    account,
    request: buildSendTextMessageRequest(account, job),
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Zalo API request thất bại.');
  }

  const result = response.data;
  const apiResult = result?.apiResult || result;
  if (apiResult && apiResult.error_code && apiResult.error_code !== 0) {
    throw new Error(apiResult.error_message || `Zalo API lỗi ${apiResult.error_code}`);
  }

  if (!result || result.verified !== true) {
    throw new Error('Không xác minh được việc gửi tin nhắn trên Zalo.');
  }

  return result;
}

export async function sendFriendRequestRequest(account, job) {
  const response = await zFetch({
    account,
    request: buildSendFriendRequestRequest(account, job),
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Zalo API request kết bạn thất bại.');
  }

  return response.data;
}