const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/requireAdmin');
const {
  getSupportTicketById,
  getSupportTicketForUser,
  markSupportTicketThreadRead,
  setSupportTicketRealtimePublisher,
} = require('./supportTicketThreadService');

const SUPPORT_SOCKET_PATH = '/api/realtime/socket.io';
const SUPPORT_TICKET_ROOM_PREFIX = 'support-ticket:';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeOrigin(raw, fallback = null) {
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = new URL(String(raw).trim());
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_err) {
    return fallback;
  }
}

function getAllowedSocketOrigins() {
  const defaults = [
    normalizeOrigin(process.env.APP_URL, 'http://localhost:3000'),
    normalizeOrigin(process.env.FRONTEND_URL, null),
  ].filter(Boolean);
  const configured = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(entry => normalizeOrigin(entry, null))
    .filter(Boolean);
  return [...new Set([...defaults, ...configured])];
}

function isSocketOriginAllowed(origin) {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  if (!origin) {
    return true;
  }
  if (origin === 'https://admin.shopify.com') {
    return true;
  }
  if (origin.startsWith('https://') && origin.endsWith('.myshopify.com')) {
    return true;
  }
  return getAllowedSocketOrigins().includes(origin);
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx <= 0) {
        return acc;
      }
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (key) {
        acc[key] = decodeURIComponent(value);
      }
      return acc;
    }, {});
}

function buildSocketAuthRequest(socket) {
  const auth = socket.handshake?.auth || {};
  const query = socket.handshake?.query || {};
  const headers = { ...(socket.handshake?.headers || {}) };
  const token = typeof auth.token === 'string' ? auth.token.trim() : '';
  const apiKey = typeof auth.apiKey === 'string' ? auth.apiKey.trim() : '';
  const adminApiKey = typeof auth.adminApiKey === 'string' ? auth.adminApiKey.trim() : '';
  const shop = typeof auth.shop === 'string' ? auth.shop.trim() : '';
  const store = typeof auth.store === 'string' ? auth.store.trim() : shop;

  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else if (apiKey && !headers.authorization) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  if (apiKey) {
    headers['x-ripx-api-key'] = apiKey;
  }
  if (adminApiKey) {
    headers['x-admin-api-key'] = adminApiKey;
  }
  if (store) {
    headers['x-ripx-store'] = store;
    headers['x-shopify-shop-domain'] = store;
  }

  return {
    headers,
    query: {
      ...query,
      ...(shop ? { shop } : {}),
      ...(store ? { store } : {}),
    },
    cookies: parseCookies(headers.cookie),
    path: '/socket.io/support',
    originalUrl: '/socket.io/support',
    method: 'GET',
    ip: socket.handshake?.address,
    socket: socket.request?.socket || {},
    connection: socket.request?.connection || {},
  };
}

function runMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    let statusCode = 500;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        const err = new Error(payload?.error || 'Socket authentication failed');
        err.status = statusCode;
        reject(err);
        return this;
      },
    };

    middleware(req, res, err => {
      if (err) {
        reject(err);
        return;
      }
      resolve(req);
    });
  });
}

function roomForTicket(ticketId) {
  return `${SUPPORT_TICKET_ROOM_PREFIX}${ticketId}`;
}

function emitTypingState(io, socket, ticketId, audience, isTyping) {
  socket.to(roomForTicket(ticketId)).emit('support:typing', {
    type: 'typing',
    ticket_id: ticketId,
    audience,
    is_typing: Boolean(isTyping),
    timestamp: new Date().toISOString(),
  });
}

function emitReadState(io, ticketId, audience, readState) {
  io.to(roomForTicket(ticketId)).emit('support:read', {
    type: 'read',
    ticket_id: ticketId,
    audience,
    read_state: readState || null,
    timestamp: new Date().toISOString(),
  });
}

function emitDeliveredState(io, ticketId, message, recipientCounts) {
  io.to(roomForTicket(ticketId)).emit('support:delivered', {
    type: 'delivered',
    ticket_id: ticketId,
    message_id: message?.id || null,
    sender_audience: normalizeAudience(message?.sender_type),
    recipient_counts: recipientCounts,
    delivered_to_user: Number(recipientCounts.user || 0) > 0,
    delivered_to_admin: Number(recipientCounts.admin || 0) > 0,
    timestamp: new Date().toISOString(),
  });
}

async function emitPresenceState(io, ticketId) {
  const room = roomForTicket(ticketId);
  const sockets = await io.in(room).fetchSockets();
  const audienceCounts = sockets.reduce(
    (counts, socket) => {
      const audience = normalizeSocketAudience(socket.data.supportRooms?.get(ticketId));
      if (!audience) {
        return counts;
      }
      counts[audience] = (counts[audience] || 0) + 1;
      return counts;
    },
    { user: 0, admin: 0 }
  );
  io.to(room).emit('support:presence', {
    type: 'presence',
    ticket_id: ticketId,
    audience_counts: audienceCounts,
    has_user: audienceCounts.user > 0,
    has_admin: audienceCounts.admin > 0,
    timestamp: new Date().toISOString(),
  });
}

function normalizeAudience(value) {
  return String(value || '').toLowerCase() === 'admin' ? 'admin' : 'user';
}

function normalizeSocketAudience(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'admin' || normalized === 'user') {
    return normalized;
  }
  return null;
}

async function authorizeSupportRoomJoin(socket, payload) {
  const ticketId = String(payload?.ticketId || payload?.ticket_id || '').trim();
  if (!ticketId || !UUID_REGEX.test(ticketId)) {
    throw new Error('Invalid ticket id');
  }

  const audience = normalizeAudience(payload?.audience);
  const authReq = buildSocketAuthRequest(socket);
  if (audience === 'admin') {
    await runMiddleware(requireAdmin, authReq);
    const ticket = await getSupportTicketById(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
  } else {
    await runMiddleware(authenticate, authReq);
    const ticket = await getSupportTicketForUser(ticketId, {
      userId: authReq.userId || null,
      email: authReq.email || null,
      shopDomain: authReq.shopDomain || null,
    });
    if (!ticket) {
      throw new Error('Ticket not found');
    }
  }

  return { ticketId, audience };
}

function initializeSupportRealtime(server) {
  const io = new Server(server, {
    path: SUPPORT_SOCKET_PATH,
    cors: {
      origin(origin, callback) {
        if (isSocketOriginAllowed(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Socket origin not allowed'));
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  if (process.env.REDIS_URL) {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        logger.info('Support realtime Socket.IO Redis adapter enabled');
      })
      .catch(err => {
        logger.warn('Support realtime Redis adapter unavailable; using in-memory adapter', {
          error: err?.message,
        });
      });
  }

  io.on('connection', socket => {
    socket.data.supportRooms = new Map();

    socket.on('support:join', async (payload, ack) => {
      try {
        const { ticketId, audience } = await authorizeSupportRoomJoin(socket, payload);
        const room = roomForTicket(ticketId);
        await socket.join(room);
        socket.data.supportRooms.set(ticketId, audience);
        const readState = await markSupportTicketThreadRead(ticketId, audience).catch(() => null);
        emitReadState(io, ticketId, audience, readState);
        emitPresenceState(io, ticketId).catch(() => null);
        if (typeof ack === 'function') {
          ack({ ok: true, ticket_id: ticketId, audience });
        }
      } catch (err) {
        logger.warn('Support socket room join rejected', {
          socketId: socket.id,
          error: err?.message,
        });
        if (typeof ack === 'function') {
          ack({ ok: false, error: err?.message || 'Could not join support thread' });
        }
      }
    });

    socket.on('support:leave', async payload => {
      const ticketId = String(payload?.ticketId || payload?.ticket_id || '').trim();
      if (!ticketId) {
        return;
      }
      await socket.leave(roomForTicket(ticketId));
      const audience = socket.data.supportRooms.get(ticketId);
      if (audience) {
        emitTypingState(io, socket, ticketId, audience, false);
      }
      socket.data.supportRooms.delete(ticketId);
      emitPresenceState(io, ticketId).catch(() => null);
    });

    socket.on('support:read', async payload => {
      const ticketId = String(payload?.ticketId || payload?.ticket_id || '').trim();
      const audience = socket.data.supportRooms.get(ticketId);
      if (!ticketId || !audience) {
        return;
      }
      const readState = await markSupportTicketThreadRead(ticketId, audience).catch(() => null);
      emitReadState(io, ticketId, audience, readState);
    });

    socket.on('support:typing', payload => {
      const ticketId = String(payload?.ticketId || payload?.ticket_id || '').trim();
      const audience = socket.data.supportRooms.get(ticketId);
      if (!ticketId || !audience) {
        return;
      }
      emitTypingState(io, socket, ticketId, audience, Boolean(payload?.isTyping));
    });

    socket.on('disconnecting', () => {
      socket.data.supportRooms.forEach((audience, ticketId) => {
        emitTypingState(io, socket, ticketId, audience, false);
      });
    });

    socket.on('disconnect', () => {
      socket.data.supportRooms.forEach((_audience, ticketId) => {
        setTimeout(() => {
          emitPresenceState(io, ticketId).catch(() => null);
        }, 0);
      });
    });
  });

  setSupportTicketRealtimePublisher((ticketId, message) => {
    const room = roomForTicket(ticketId);
    io.to(room).emit('support:message', {
      type: 'message',
      ticket_id: ticketId,
      message,
    });

    io.in(room)
      .fetchSockets()
      .then(sockets => {
        const senderAudience = normalizeAudience(message?.sender_type);
        const recipientCounts = { user: 0, admin: 0 };
        const readJobs = [];
        sockets.forEach(socket => {
          const audience = normalizeSocketAudience(socket.data.supportRooms?.get(ticketId));
          if (audience && audience !== senderAudience) {
            recipientCounts[audience] = (recipientCounts[audience] || 0) + 1;
            readJobs.push(
              markSupportTicketThreadRead(ticketId, audience)
                .then(readState => emitReadState(io, ticketId, audience, readState))
                .catch(() => null)
            );
          }
        });
        if (recipientCounts.user > 0 || recipientCounts.admin > 0) {
          emitDeliveredState(io, ticketId, message, recipientCounts);
        }
        return Promise.all(readJobs);
      })
      .catch(() => {});
  });

  logger.info('Support realtime Socket.IO initialized', { path: SUPPORT_SOCKET_PATH });
  return io;
}

module.exports = {
  SUPPORT_SOCKET_PATH,
  initializeSupportRealtime,
};
