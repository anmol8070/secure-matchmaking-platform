import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USER, fakeAccessToken, mockApi, renderApp } from '../../test/renderApp.jsx';

// In-memory stand-in for the single app socket: tests fire server events directly.
const fake = vi.hoisted(() => {
  const handlers = new Map();
  const connectHandlers = new Set();
  return {
    handlers,
    connectHandlers,
    connected: true,
    request: null,
    emit: null,
    fire(event, payload, ack) {
      for (const handler of [...(handlers.get(event) || [])]) handler(payload, ack);
    },
    reconnect() {
      for (const handler of [...connectHandlers]) handler();
    },
  };
});

vi.mock('../../services/socketService.js', async () => {
  const actual = await vi.importActual('../../services/socketService.js');
  return {
    SOCKET_EVENTS: actual.SOCKET_EVENTS,
    socketService: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      isConnected: () => fake.connected,
      on: (event, handler) => {
        if (!fake.handlers.has(event)) fake.handlers.set(event, new Set());
        fake.handlers.get(event).add(handler);
        return () => fake.handlers.get(event).delete(handler);
      },
      onConnect: (handler) => {
        fake.connectHandlers.add(handler);
        handler();
        return () => fake.connectHandlers.delete(handler);
      },
      request: (...args) => fake.request(...args),
      emit: (...args) => fake.emit(...args),
    },
  };
});

const ME = USER.user_id; // 7
const RIYA = 4;

const ok = (data, message = 'Request successful') => ({ status: 200, body: { success: true, message, data } });
const fail = (status, message) => ({ status, body: { success: false, message } });

const msg = (id, senderId, text, extra = {}) => ({
  id,
  conversationId: 55,
  senderId,
  receiverId: senderId === ME ? RIYA : ME,
  type: 'text',
  message: text,
  status: 'sent',
  createdAt: '2026-10-21T10:00:00.000Z',
  deliveredAt: null,
  readAt: null,
  ...extra,
});

const history = (messages, extra = {}) =>
  ok({
    conversationId: 55,
    participant: { userId: RIYA, name: 'Riya Shah', profilePicture: null, age: 29, location: 'Pune' },
    canSend: true,
    messages,
    pagination: { limit: 50, hasMore: false, nextCursor: null },
    ...extra,
  });

function signedIn(routes = {}) {
  sessionStorage.setItem('mm.accessToken', fakeAccessToken());
  return mockApi({ 'GET /auth/me': ok(USER), ...routes });
}

const bubbles = () => screen.getAllByTestId('chat-message').map((el) => el.querySelector('p')?.textContent);
/** Waits until the page has subscribed to the socket events (effects ran). */
const subscribed = () => waitFor(() => expect(fake.handlers.get('message:received')?.size).toBeGreaterThan(0));
const type = (value) => fireEvent.change(screen.getByLabelText('Message'), { target: { value } });

beforeEach(() => {
  fake.handlers.clear();
  fake.connectHandlers.clear();
  fake.connected = true;
  fake.emit = vi.fn();
  fake.request = vi.fn(async (event) =>
    event === 'conversation:join' ? { success: true, conversationId: 55, canSend: true, participantOnline: true } : { success: true }
  );
});

/* ---------------- opening ---------------- */

describe('opening a chat', () => {
  it('requires sign-in', async () => {
    mockApi();
    renderApp(`/chat/${RIYA}`);
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'));
  });

  it('shows the header, history oldest → newest, and joins the conversation', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([msg(1, RIYA, 'Hello!'), msg(2, ME, 'Hi!', { status: 'read' }), msg(3, RIYA, 'How are you?', { status: 'read' })]) });
    renderApp(`/chat/${RIYA}`);

    expect(await screen.findByRole('heading', { name: 'Riya Shah' })).toBeInTheDocument();
    expect(bubbles()).toEqual(['Hello!', 'Hi!', 'How are you?']);
    await waitFor(() => expect(fake.request).toHaveBeenCalledWith('conversation:join', { userId: RIYA }));
    expect(await screen.findByTestId('presence')).toHaveTextContent('Online');
    expect(screen.getByText(/Read/)).toBeInTheDocument();
  });

  it('shows no online status when the other user does not share it (Phase 13)', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([]) });
    fake.request = vi.fn(async () => ({ success: true, conversationId: 55, canSend: true, participantOnline: null }));
    renderApp(`/chat/${RIYA}`);
    await waitFor(() => expect(fake.request).toHaveBeenCalledWith('conversation:join', { userId: RIYA }));
    expect(screen.getByTestId('presence').textContent).toBe('');
  });

  it('shows the empty state', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([]) });
    renderApp(`/chat/${RIYA}`);
    expect(await screen.findByText('No messages yet. Start the conversation.')).toBeInTheDocument();
  });

  it('does not open the conversation for users who are not connected', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: fail(403, 'Messaging is available only between connected users.') });
    renderApp(`/chat/${RIYA}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Messaging is available only between connected users.');
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
    expect(fake.request).not.toHaveBeenCalled();
  });

  it('shows a neutral message for blocked users', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: fail(403, 'You cannot message this user.') });
    renderApp(`/chat/${RIYA}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Messaging is unavailable.');
  });

  it('keeps the history read-only when the connection has ended', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([msg(1, RIYA, 'Old message', { status: 'read' })], { canSend: false }) });
    fake.request = vi.fn(async () => ({ success: true, conversationId: 55, canSend: false, participantOnline: false }));
    renderApp(`/chat/${RIYA}`);
    expect(await screen.findByText('Old message')).toBeInTheDocument();
    expect(screen.getByText('You can no longer send messages in this conversation.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
  });
});

/* ---------------- sending ---------------- */

describe('sending', () => {
  it('sends over the socket, disables the button while sending and ignores double submits', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([]) });
    let release;
    fake.request = vi.fn((event, payload) => {
      if (event !== 'message:send') return Promise.resolve({ success: true, canSend: true, participantOnline: false });
      return new Promise((resolve) => (release = () => resolve({ success: true, message: msg(9, ME, payload.message) })));
    });
    renderApp(`/chat/${RIYA}`);
    await screen.findByLabelText('Message');

    type('  Hello there  ');
    const form = screen.getByLabelText('Message').closest('form');
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled();
    await act(async () => release());

    expect(await screen.findByText('Hello there')).toBeInTheDocument();
    expect(fake.request.mock.calls.filter(([e]) => e === 'message:send')).toEqual([['message:send', { receiverId: RIYA, message: 'Hello there' }]]);
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });

  it('falls back to REST when the socket is disconnected', async () => {
    const api = signedIn({
      [`GET /messages/${RIYA}`]: history([]),
      'POST /messages': { status: 201, body: { success: true, data: { message: msg(10, ME, 'Saved anyway') } } },
    });
    renderApp(`/chat/${RIYA}`);
    await screen.findByLabelText('Message');
    fake.connected = false;

    type('Saved anyway');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Saved anyway')).toBeInTheDocument();
    expect(api.callsTo('POST', '/messages')[0].body).toEqual({ receiverId: RIYA, message: 'Saved anyway' });
  });

  it('shows an error when sending fails', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([]) });
    fake.request = vi.fn(async (event) =>
      event === 'message:send' ? { success: false, error: 'Unable to send message.', code: 500 } : { success: true, canSend: true }
    );
    renderApp(`/chat/${RIYA}`);
    await screen.findByLabelText('Message');
    type('Hi');
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to send message.');
  });

  it('shows the rate-limit message from the server', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([]) });
    fake.request = vi.fn(async (event) =>
      event === 'message:send'
        ? { success: false, error: 'You are sending messages too quickly. Please wait a moment.', code: 429 }
        : { success: true, canSend: true }
    );
    renderApp(`/chat/${RIYA}`);
    await screen.findByLabelText('Message');
    type('Hi');
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('too quickly');
  });

  it('emits typing indicators while typing', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([]) });
    renderApp(`/chat/${RIYA}`);
    await screen.findByLabelText('Message');
    type('H');
    type('Hi');
    expect(fake.emit).toHaveBeenCalledTimes(1);
    expect(fake.emit).toHaveBeenCalledWith('typing:start', { userId: RIYA });
  });
});

/* ---------------- receiving ---------------- */

describe('real-time events', () => {
  it('adds incoming messages once, acknowledges them and ignores other conversations', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([msg(1, RIYA, 'First', { status: 'read' })]), 'PUT /messages/2/read': ok({ read: { messageIds: [2], readAt: '2026-10-21T10:05:00.000Z' } }) });
    renderApp(`/chat/${RIYA}`);
    await screen.findByText('First');
    await subscribed();

    const ack = vi.fn();
    act(() => {
      fake.fire('message:received', msg(2, RIYA, 'Second'), ack);
      fake.fire('message:received', msg(2, RIYA, 'Second'), ack); // duplicate (e.g. reconnect)
      fake.fire('message:received', { ...msg(3, 99, 'Not for this chat'), receiverId: ME }, ack);
      fake.fire('message:received', { bogus: true }, ack);
    });

    expect(await screen.findByText('Second')).toBeInTheDocument();
    expect(bubbles()).toEqual(['First', 'Second']);
    expect(ack).toHaveBeenCalledWith({ received: true });
  });

  it('marks incoming messages read when the conversation is open', async () => {
    const api = signedIn({
      [`GET /messages/${RIYA}`]: history([msg(1, RIYA, 'Unread one'), msg(2, RIYA, 'Unread two')]),
      'PUT /messages/2/read': ok({ read: { messageIds: [1, 2], readAt: '2026-10-21T10:05:00.000Z' } }),
    });
    renderApp(`/chat/${RIYA}`);
    await waitFor(() => expect(api.callsTo('PUT', '/messages/2/read')).toHaveLength(1));
    expect(api.callsTo('PUT', '/messages/1/read')).toHaveLength(0);
  });

  it('updates delivery and read status of sent messages', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([msg(5, ME, 'Mine')]) });
    renderApp(`/chat/${RIYA}`);
    const bubble = (await screen.findByText('Mine')).closest('[data-testid="chat-message"]');
    expect(within(bubble).getByText(/Sent/)).toBeInTheDocument();
    await subscribed();

    act(() => fake.fire('message:delivered', { messageIds: [5], deliveredAt: '2026-10-21T10:01:00.000Z' }));
    expect(await within(bubble).findByText(/Delivered/)).toBeInTheDocument();
    act(() => fake.fire('message:read', { messageIds: [5], readAt: '2026-10-21T10:02:00.000Z' }));
    expect(await within(bubble).findByText(/Read/)).toBeInTheDocument();
  });

  it('shows typing, presence changes and conversation closure', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([]) });
    renderApp(`/chat/${RIYA}`);
    const presence = await screen.findByTestId('presence');
    await waitFor(() => expect(presence).toHaveTextContent('Online')); // join acknowledged

    act(() => fake.fire('typing:start', { userId: RIYA, conversationId: 55 }));
    expect(presence).toHaveTextContent('Riya Shah is typing…');
    act(() => fake.fire('typing:stop', { userId: RIYA, conversationId: 55 }));
    act(() => fake.fire('presence:update', { userId: RIYA, online: false }));
    expect(presence).toHaveTextContent('Offline');

    act(() => fake.fire('conversation:closed', { conversationId: 55, canSend: false }));
    expect(await screen.findByText('You can no longer send messages in this conversation.')).toBeInTheDocument();
  });

  it('re-joins and refetches history after a reconnect, without duplicates', async () => {
    const api = signedIn({
      [`GET /messages/${RIYA}`]: [history([msg(1, RIYA, 'Before', { status: 'read' })]), history([msg(1, RIYA, 'Before', { status: 'read' }), msg(2, RIYA, 'Missed while offline', { status: 'read' })])],
    });
    renderApp(`/chat/${RIYA}`);
    await screen.findByText('Before');
    await subscribed();

    act(() => fake.reconnect());
    expect(await screen.findByText('Missed while offline')).toBeInTheDocument();
    expect(bubbles()).toEqual(['Before', 'Missed while offline']);
    expect(api.callsTo('GET', `/messages/${RIYA}`)).toHaveLength(2);
    expect(fake.request.mock.calls.filter(([e]) => e === 'conversation:join')).toHaveLength(2);
  });

  it('renders markup as plain text (no HTML injection)', async () => {
    const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    signedIn({ [`GET /messages/${RIYA}`]: history([msg(1, RIYA, payload, { status: 'read' })]) });
    const { container } = renderApp(`/chat/${RIYA}`);
    expect(await screen.findByText(payload)).toBeInTheDocument();
    expect(container.querySelector('.chat img, .chat script')).toBeNull();
    expect(window.__xss).toBeUndefined();
  });
});

/* ---------------- conversation list ---------------- */

describe('messages page', () => {
  it('lists conversations with unread counts', async () => {
    signedIn({
      'GET /messages/conversations': ok({
        conversations: [
          { conversationId: 55, participant: { userId: RIYA, name: 'Riya Shah', profilePicture: null }, canSend: true, lastMessage: msg(3, RIYA, 'See you!'), unreadCount: 2 },
        ],
      }),
    });
    renderApp('/messages');
    const card = (await screen.findByText('Riya Shah')).closest('li');
    expect(within(card).getByText('See you!')).toBeInTheDocument();
    expect(within(card).getByText('2 unread')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open' })).toHaveAttribute('href', `/chat/${RIYA}`);
  });

  it('shows the empty state', async () => {
    signedIn({ 'GET /messages/conversations': ok({ conversations: [] }) });
    renderApp('/messages');
    expect(await screen.findByText(/No conversations yet/)).toBeInTheDocument();
  });
});

/* ---------------- images ---------------- */

describe('image messages', () => {
  const imageMsg = (id, senderId, caption = '', extra = {}) =>
    msg(id, senderId, caption, { type: 'image', image: { path: `/messages/${id}/image`, contentType: 'image/webp', width: 640, height: 480, size: 1000 }, ...extra });

  /** Serves image bytes for /messages/:id/image (mockApi only answers JSON). */
  function serveImages({ fail = false } = {}) {
    const json = global.fetch;
    const imageCalls = [];
    global.fetch = vi.fn(async (url, options = {}) => {
      if (/\/messages\/\d+\/image$/.test(new URL(url).pathname)) {
        imageCalls.push({ url, headers: options.headers || {} });
        return fail
          ? { ok: false, status: 404, statusText: 'Not Found', blob: async () => null }
          : { ok: true, status: 200, statusText: 'OK', blob: async () => new Blob(['img'], { type: 'image/webp' }) };
      }
      return json(url, options);
    });
    return imageCalls;
  }

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:chat-image');
    URL.revokeObjectURL = vi.fn();
  });

  it('loads private images with the access token and shows the caption as text', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([imageMsg(5, RIYA, 'Sunset <b>!</b>', { status: 'read' })]) });
    const imageCalls = serveImages();
    renderApp(`/chat/${RIYA}`);

    const img = await screen.findByRole('img', { name: 'Photo from Riya Shah' });
    expect(img).toHaveAttribute('src', 'blob:chat-image');
    expect(imageCalls[0].url).toMatch(/\/api\/v1\/messages\/5\/image$/);
    expect(imageCalls[0].headers.Authorization).toMatch(/^Bearer /);
    expect(screen.getByText('Sunset <b>!</b>')).toBeInTheDocument();
  });

  it('shows a placeholder when an image cannot be loaded', async () => {
    signedIn({ [`GET /messages/${RIYA}`]: history([imageMsg(5, RIYA, '', { status: 'read' })]) });
    serveImages({ fail: true });
    renderApp(`/chat/${RIYA}`);
    expect(await screen.findByText('Image unavailable')).toBeInTheDocument();
  });

  it('sends a chosen image with the typed text as caption', async () => {
    const api = signedIn({
      [`GET /messages/${RIYA}`]: history([]),
      'POST /messages/images': { status: 201, body: { success: true, data: { message: imageMsg(9, ME, 'For you') } } },
    });
    serveImages();
    renderApp(`/chat/${RIYA}`);
    await screen.findByLabelText('Message');
    type('For you');

    const file = new File([new Uint8Array(2048)], 'flower.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('chat-image-input'), { target: { files: [file] } });

    expect(await screen.findByRole('img', { name: 'Photo from you' })).toBeInTheDocument();
    const form = api.callsTo('POST', '/messages/images')[0].body;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('receiverId')).toBe(String(RIYA));
    expect(form.get('caption')).toBe('For you');
    expect(form.get('image')).toBe(file);
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });

  it.each([
    ['an unsupported type', new File([new Uint8Array(10)], 'anim.gif', { type: 'image/gif' }), /Unsupported image type/],
    ['a file over 5 MB', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' }), /too large/],
  ])('refuses %s before uploading', async (_, file, error) => {
    const api = signedIn({ [`GET /messages/${RIYA}`]: history([]) });
    renderApp(`/chat/${RIYA}`);
    await screen.findByLabelText('Message');
    fireEvent.change(screen.getByTestId('chat-image-input'), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(api.callsTo('POST', '/messages/images')).toHaveLength(0);
  });

  it('shows the server error when the upload is refused', async () => {
    signedIn({
      [`GET /messages/${RIYA}`]: history([]),
      'POST /messages/images': fail(415, 'Unsupported image type. Use a JPG, PNG or WEBP image.'),
    });
    renderApp(`/chat/${RIYA}`);
    await screen.findByLabelText('Message');
    fireEvent.change(screen.getByTestId('chat-image-input'), { target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported image type');
  });

  it('labels image messages in the conversation list', async () => {
    signedIn({
      'GET /messages/conversations': ok({
        conversations: [{ conversationId: 55, participant: { userId: RIYA, name: 'Riya Shah', profilePicture: null }, canSend: true, lastMessage: imageMsg(3, RIYA, 'Beach'), unreadCount: 0 }],
      }),
    });
    renderApp('/messages');
    expect(await screen.findByText('📷 Photo · Beach')).toBeInTheDocument();
  });
});

/* ---------------- read receipts and visibility ---------------- */

describe('read receipts follow tab visibility', () => {
  const setVisibility = (state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  afterEach(() => setVisibility('visible'));

  it('waits until the tab is visible before marking messages read', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    const api = signedIn({
      [`GET /messages/${RIYA}`]: history([msg(1, RIYA, 'Unread')]),
      'PUT /messages/1/read': ok({ read: { messageIds: [1], readAt: '2026-10-21T10:05:00.000Z' } }),
    });
    renderApp(`/chat/${RIYA}`);
    await screen.findByText('Unread');
    await new Promise((r) => setTimeout(r, 50));
    expect(api.callsTo('PUT', '/messages/1/read')).toHaveLength(0);

    act(() => setVisibility('visible'));
    await waitFor(() => expect(api.callsTo('PUT', '/messages/1/read')).toHaveLength(1));
  });
});
