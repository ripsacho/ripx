import { io } from 'socket.io-client';
import { getApiKey, getEmailToken, getRealtimeSocketConfig, getShopDomain } from './api';

let supportSocket = null;
let supportSocketKey = '';

function buildSocketConfig() {
  const { url, path } = getRealtimeSocketConfig();
  const shopDomain = getShopDomain() || undefined;
  const auth = {
    token: getEmailToken() || undefined,
    apiKey: getApiKey() || undefined,
    shop: shopDomain,
    store: shopDomain,
  };
  return {
    url,
    path,
    auth,
    key: JSON.stringify({ url, path, auth }),
  };
}

function createSupportSocket({ url, path, auth }) {
  return io(url, {
    path,
    transports: ['websocket', 'polling'],
    withCredentials: true,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    auth,
  });
}

function getSupportSocket() {
  if (typeof window === 'undefined') {
    return null;
  }

  const config = buildSocketConfig();
  if (supportSocket && supportSocketKey === config.key) {
    supportSocket.auth = config.auth;
    return supportSocket;
  }

  if (supportSocket) {
    supportSocket.removeAllListeners();
    supportSocket.disconnect();
  }
  supportSocketKey = config.key;
  supportSocket = createSupportSocket(config);
  return supportSocket;
}

export function subscribeSupportTicketRealtime({
  ticketId,
  audience = 'user',
  onMessage,
  onState,
  onError,
  onTyping,
  onRead,
  onPresence,
  onDelivered,
}) {
  const normalizedTicketId = String(ticketId || '').trim();
  if (!normalizedTicketId) {
    return () => {};
  }

  const socket = getSupportSocket();
  if (!socket) {
    onState?.('offline');
    return () => {};
  }

  let active = true;
  let typingClearTimeout = null;
  let lastTypingValue = false;
  let lastTypingSentAt = 0;
  const setState = state => {
    if (active) onState?.(state);
  };
  const handleConnect = () => {
    setState('connecting');
    socket
      .timeout(8000)
      .emit('support:join', { ticketId: normalizedTicketId, audience }, (err, response) => {
        if (!active) return;
        if (err) {
          setState('reconnecting');
          onError?.('Realtime join timed out. Reconnecting...');
          return;
        }
        if (response?.ok) {
          setState('live');
        } else {
          setState('offline');
          onError?.(response?.error || 'Could not join support realtime thread');
        }
      });
  };
  const handleReconnectAttempt = () => {
    const nextConfig = buildSocketConfig();
    socket.auth = nextConfig.auth;
  };
  const handleDisconnect = reason => {
    if (!active) {
      return;
    }
    if (reason === 'io server disconnect') {
      socket.connect();
      return;
    }
    setState('reconnecting');
  };
  const handleConnectError = error => {
    const nextConfig = buildSocketConfig();
    socket.auth = nextConfig.auth;
    setState('reconnecting');
    onError?.(error?.message || 'Realtime connection failed');
  };
  const handleSupportMessage = payload => {
    if (payload?.ticket_id !== normalizedTicketId || !payload?.message?.id) {
      return;
    }
    onMessage?.(payload.message);
    socket.emit('support:read', { ticketId: normalizedTicketId });
  };
  const handleSupportTyping = payload => {
    if (payload?.ticket_id !== normalizedTicketId) {
      return;
    }
    const typingEvent = {
      audience: payload.audience,
      isTyping: Boolean(payload.is_typing),
      timestamp: payload.timestamp || null,
    };
    onTyping?.(typingEvent);
    if (typingClearTimeout) {
      clearTimeout(typingClearTimeout);
      typingClearTimeout = null;
    }
    if (typingEvent.isTyping) {
      typingClearTimeout = setTimeout(() => {
        if (!active) {
          return;
        }
        onTyping?.({
          audience: typingEvent.audience,
          isTyping: false,
          timestamp: new Date().toISOString(),
        });
      }, 3500);
    }
  };
  const handleSupportRead = payload => {
    if (payload?.ticket_id !== normalizedTicketId) {
      return;
    }
    onRead?.({
      audience: payload.audience,
      readState: payload.read_state || null,
      timestamp: payload.timestamp || null,
    });
  };
  const handleSupportPresence = payload => {
    if (payload?.ticket_id !== normalizedTicketId) {
      return;
    }
    onPresence?.({
      audienceCounts: payload.audience_counts || { user: 0, admin: 0 },
      hasUser: Boolean(payload.has_user),
      hasAdmin: Boolean(payload.has_admin),
      timestamp: payload.timestamp || null,
    });
  };
  const handleSupportDelivered = payload => {
    if (payload?.ticket_id !== normalizedTicketId) {
      return;
    }
    onDelivered?.({
      messageId: payload.message_id || null,
      senderAudience: payload.sender_audience || null,
      recipientCounts: payload.recipient_counts || { user: 0, admin: 0 },
      deliveredToUser: Boolean(payload.delivered_to_user),
      deliveredToAdmin: Boolean(payload.delivered_to_admin),
      timestamp: payload.timestamp || null,
    });
  };

  socket.on('connect', handleConnect);
  socket.io.on('reconnect_attempt', handleReconnectAttempt);
  socket.on('disconnect', handleDisconnect);
  socket.on('connect_error', handleConnectError);
  socket.on('support:message', handleSupportMessage);
  socket.on('support:typing', handleSupportTyping);
  socket.on('support:read', handleSupportRead);
  socket.on('support:presence', handleSupportPresence);
  socket.on('support:delivered', handleSupportDelivered);

  if (socket.connected) {
    handleConnect();
  } else {
    setState('connecting');
    socket.connect();
  }

  const unsubscribe = () => {
    if (!active) {
      return;
    }
    active = false;
    if (typingClearTimeout) {
      clearTimeout(typingClearTimeout);
      typingClearTimeout = null;
    }
    socket.emit('support:typing', { ticketId: normalizedTicketId, isTyping: false });
    socket.emit('support:leave', { ticketId: normalizedTicketId });
    socket.off('connect', handleConnect);
    socket.io.off('reconnect_attempt', handleReconnectAttempt);
    socket.off('disconnect', handleDisconnect);
    socket.off('connect_error', handleConnectError);
    socket.off('support:message', handleSupportMessage);
    socket.off('support:typing', handleSupportTyping);
    socket.off('support:read', handleSupportRead);
    socket.off('support:presence', handleSupportPresence);
    socket.off('support:delivered', handleSupportDelivered);
  };
  unsubscribe.sendTyping = isTyping => {
    if (!active || !socket.connected) {
      return;
    }
    const nextTypingValue = Boolean(isTyping);
    const now = Date.now();
    if (nextTypingValue && lastTypingValue && now - lastTypingSentAt < 1200) {
      return;
    }
    if (!nextTypingValue && !lastTypingValue) {
      return;
    }
    lastTypingValue = nextTypingValue;
    lastTypingSentAt = now;
    socket.emit('support:typing', {
      ticketId: normalizedTicketId,
      isTyping: nextTypingValue,
    });
  };
  unsubscribe.markRead = () => {
    if (!active || !socket.connected) {
      return;
    }
    socket.emit('support:read', { ticketId: normalizedTicketId });
  };

  return unsubscribe;
}
