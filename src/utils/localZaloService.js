const DEFAULT_SERVICE_URL = import.meta.env.VITE_ZALO_SERVICE_URL || 'http://127.0.0.1:4517';

function buildUrl(path) {
  return DEFAULT_SERVICE_URL.replace(/\/$/, '') + path;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

export async function requestLocalZaloService(path, payload = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Agent': navigator.userAgent,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await parseJson(response);
    if (!response.ok) {
      throw new Error(data?.error || `Local service trả về mã lỗi ${response.status}.`);
    }

    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Local Zalo service phản hồi quá chậm.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkLocalZaloService(timeoutMs = 2500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl('/health'), {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const data = await parseJson(response);
    return Boolean(data?.ok);
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function syncAccountViaLocalService(payload) {
  return requestLocalZaloService('/api/zalo/account/sync', payload, 180000);
}

export function sendMessageJobsViaLocalService(payload) {
  return requestLocalZaloService('/api/zalo/messages/batch', payload, 180000);
}

export function sendFriendRequestJobsViaLocalService(payload) {
  return requestLocalZaloService('/api/zalo/friends/requests/batch', payload, 180000);
}

export function resolveGroupInviteTargetsViaLocalService(payload) {
  return requestLocalZaloService('/api/zalo/groups/invite-targets', payload, 180000);
}

export function runAccountActionJobsViaLocalService(payload) {
  return requestLocalZaloService('/api/zalo/actions/batch', payload, 180000);
}