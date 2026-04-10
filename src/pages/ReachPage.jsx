import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import LeftColumn from '../components/LeftColumn';
import RightColumn from '../components/RightColumn';
import { onExtensionMessage } from '../utils/extensionBridge';
import { ACTION_DEFAULTS } from '../utils/reachActionConfig';

const CAMPAIGN_STORAGE_KEY = 'zalotool_campaign_state';

function loadCampaignState() {
  try {
    const raw = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
    if (!raw) {
      return {
        actionJobs: [],
        inviteJobs: [],
        messageJobs: [],
        scheduledJobs: [],
      };
    }
    const parsed = JSON.parse(raw);
    return {
      actionJobs: Array.isArray(parsed.actionJobs) ? parsed.actionJobs : [],
      inviteJobs: Array.isArray(parsed.inviteJobs) ? parsed.inviteJobs : [],
      messageJobs: Array.isArray(parsed.messageJobs) ? parsed.messageJobs : [],
      scheduledJobs: Array.isArray(parsed.scheduledJobs) ? parsed.scheduledJobs : [],
    };
  } catch {
    return {
      actionJobs: [],
      inviteJobs: [],
      messageJobs: [],
      scheduledJobs: [],
    };
  }
}

function prependRecent(existing, incoming) {
  const merged = [...incoming, ...existing];
  const seen = new Set();
  return merged.filter((item) => {
    if (!item?.id) return true;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 300);
}

function applyJobUpdate(items, jobId, changes) {
  return items.map((item) => {
    if (item?.id !== jobId) return item;
    return {
      ...item,
      ...changes,
      updatedAt: new Date().toISOString(),
    };
  });
}

export default function ReachPage() {
  const [actionState, setActionState] = useState(ACTION_DEFAULTS);
  const [selection, setSelection] = useState({
    activeTab: 0,
    activeLabel: 'Bạn bè',
    allItems: [],
    selectedItems: [],
  });
  const [campaignState, setCampaignState] = useState(loadCampaignState);

  useEffect(() => {
    localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaignState));
  }, [campaignState]);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((msg) => {
      if (msg.type !== 'ZALOTOOL_MESSAGE_JOB_UPDATE' || !msg.data?.jobId || !msg.data?.changes) {
        return;
      }

      setCampaignState((prev) => ({
        actionJobs: prev.actionJobs,
        inviteJobs: prev.inviteJobs,
        messageJobs: applyJobUpdate(prev.messageJobs, msg.data.jobId, msg.data.changes),
        scheduledJobs: applyJobUpdate(prev.scheduledJobs, msg.data.jobId, msg.data.changes),
      }));
    });

    return unsubscribe;
  }, []);

  const handleCampaignCommit = (payload) => {
    setCampaignState((prev) => ({
      actionJobs: prependRecent(prev.actionJobs, payload.actionJobs || []),
      inviteJobs: prependRecent(prev.inviteJobs, payload.inviteJobs || []),
      messageJobs: prependRecent(prev.messageJobs, payload.messageJobs || []),
      scheduledJobs: prependRecent(prev.scheduledJobs, payload.scheduledJobs || []),
    }));
  };

  return (
    <Box sx={{ p: 2.5 }}>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
        {/* Left column */}
        <Box sx={{ flex: '1 1 50%', minWidth: 0 }}>
          <LeftColumn
            selection={selection}
            actionState={actionState}
            campaignState={campaignState}
            onCampaignCommit={handleCampaignCommit}
          />
        </Box>

        {/* Right column */}
        <Box sx={{ flex: '1 1 50%', minWidth: 0 }}>
          <RightColumn
            campaignState={campaignState}
            actionState={actionState}
            onActionStateChange={setActionState}
            onSelectionChange={setSelection}
          />
        </Box>
      </Box>
    </Box>
  );
}
