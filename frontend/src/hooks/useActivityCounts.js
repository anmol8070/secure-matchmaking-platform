import { useEffect, useState } from 'react';
import { connectionService } from '../services/connectionService.js';
import { messageService } from '../services/messageService.js';

/**
 * Live counts for the member navigation and dashboard.
 * Both numbers come from the same endpoints as the Requests and Messages
 * pages. A failed request leaves that count unset so the UI never invents one.
 */
export default function useActivityCounts() {
  const [counts, setCounts] = useState({ requests: null, unread: null });

  useEffect(() => {
    let cancelled = false;
    connectionService
      .getReceivedRequests()
      .then((res) => !cancelled && setCounts((current) => ({ ...current, requests: res.data.requests.length })))
      .catch(() => {});
    messageService
      .getConversations()
      .then((res) => {
        if (cancelled) return;
        const unread = (res.data.conversations || []).reduce((sum, item) => sum + (item.unreadCount || 0), 0);
        setCounts((current) => ({ ...current, unread }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return counts;
}
