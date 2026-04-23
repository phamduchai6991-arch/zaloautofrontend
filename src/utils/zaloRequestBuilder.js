import { getZaloCommonData } from './extensionBridge';

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

export async function syncZaloCommonData(account) {
  const response = await getZaloCommonData({ account });
  if (!response?.ok) {
    throw new Error(response?.error || 'Không thể đồng bộ session Zalo hiện tại.');
  }
  return normalizeSessionSnapshot(response.data || {});
}
