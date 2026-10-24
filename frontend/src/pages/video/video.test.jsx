import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USER, fakeAccessToken, mockApi, renderApp } from '../../test/renderApp.jsx';

/* ---------- fakes: socket, media devices, RTCPeerConnection ---------- */

const fake = vi.hoisted(() => {
  const handlers = new Map();
  const connectHandlers = new Set();
  return {
    handlers,
    connectHandlers,
    request: null,
    emit: null,
    fire(event, payload) {
      for (const handler of [...(handlers.get(event) || [])]) handler(payload);
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
      isConnected: () => true,
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

const peers = [];
class FakePeerConnection {
  constructor(config) {
    this.config = config;
    this.connectionState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
    this.tracks = [];
    this.candidates = [];
    this.offerOptions = [];
    this.closed = false;
    peers.push(this);
  }
  addTrack(track) {
    this.tracks.push(track);
  }
  async createOffer(options) {
    this.offerOptions.push(options);
    return { type: 'offer', sdp: 'fake-offer' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'fake-answer' };
  }
  async setLocalDescription(description) {
    this.localDescription = description;
  }
  async setRemoteDescription(description) {
    this.remoteDescription = description;
  }
  async addIceCandidate(candidate) {
    this.candidates.push(candidate);
  }
  close() {
    this.closed = true;
    this.connectionState = 'closed';
  }
  /** Test helper: simulate the browser's connection state changing. */
  set(state) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
  /** Test helper: simulate the remote track arriving. */
  remoteTrack() {
    const stream = new FakeStream([fakeTrack('video')]);
    this.ontrack?.({ streams: [stream], track: stream.getTracks()[0] });
  }
}

function fakeTrack(kind) {
  return {
    kind,
    enabled: true,
    readyState: 'live',
    stop: vi.fn(function stop() {
      this.readyState = 'ended';
    }),
  };
}

class FakeStream {
  constructor(tracks = []) {
    this.tracks = tracks;
  }
  addTrack(track) {
    this.tracks.push(track);
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
}

let localStream;
function setMedia(getUserMedia, devices = [{ kind: 'videoinput' }, { kind: 'audioinput' }]) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: getUserMedia && { getUserMedia, enumerateDevices: async () => devices },
  });
}

/* ---------- API fixtures ---------- */

const ME = USER.user_id; // 7
const RIYA = 4;
const RIYA_CARD = { userId: RIYA, name: 'Riya Shah', profilePicture: null, age: 29, location: 'Pune' };
const ok = (data) => ({ status: 200, body: { success: true, message: 'Request successful', data } });
const ICE = ok({ iceServers: [{ urls: ['stun:stun.example.com'] }], expiresAt: null, relay: false });

const call = (overrides = {}) => ({
  id: 55,
  callerId: RIYA,
  receiverId: ME,
  direction: 'incoming',
  status: 'ringing',
  createdAt: '2026-10-22T10:00:00.000Z',
  answeredAt: null,
  connectedAt: null,
  endedAt: null,
  durationSeconds: null,
  endReason: null,
  otherUser: RIYA_CARD,
  ...overrides,
});

function signedIn(routes = {}) {
  sessionStorage.setItem('mm.accessToken', fakeAccessToken());
  return mockApi({ 'GET /auth/me': ok(USER), 'GET /calls/ice-servers': ICE, ...routes });
}

/** Waits until a component has subscribed to `event` (its effect ran). */
const subscribed = (event) => waitFor(() => expect(fake.handlers.get(event)?.size).toBeGreaterThan(0));
const requests = (event) => fake.request.mock.calls.filter(([e]) => e === event).map(([, payload]) => payload);
const status = () => screen.getByTestId('call-status').textContent;

beforeEach(() => {
  fake.handlers.clear();
  fake.connectHandlers.clear();
  fake.emit = vi.fn();
  fake.request = vi.fn(async (event, payload) => {
    if (event === 'call:initiate') return { success: true, busy: false, receiverOnline: true, call: call({ callerId: ME, receiverId: RIYA, direction: 'outgoing' }) };
    if (event === 'call:accept') return { success: true, call: call({ status: 'accepted' }) };
    if (event === 'call:end') return { success: true, call: call({ id: payload.callId, status: 'ended', durationSeconds: 42 }) };
    return { success: true };
  });
  peers.length = 0;
  global.RTCPeerConnection = FakePeerConnection;
  global.MediaStream = FakeStream;
  localStream = new FakeStream([fakeTrack('audio'), fakeTrack('video')]);
  setMedia(vi.fn(async () => localStream));
});

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
});

/* ---------- camera / microphone ---------- */

describe('camera and microphone', () => {
  it.each([
    ['NotAllowedError', /permission is required/],
    ['NotReadableError', /being used by another application/],
  ])('explains %s and allows a retry without placing the call', async (name, message) => {
    const getUserMedia = vi.fn().mockRejectedValueOnce(Object.assign(new Error(name), { name })).mockResolvedValue(localStream);
    setMedia(getUserMedia);
    signedIn();
    renderApp(`/video?with=${RIYA}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(requests('call:initiate')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(requests('call:initiate')).toHaveLength(1));
  });

  it('says which device is missing', async () => {
    setMedia(vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotFoundError' })), [{ kind: 'videoinput' }]);
    signedIn();
    renderApp(`/video?with=${RIYA}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('No microphone was found');
  });

  it('explains when the browser cannot do video calls', async () => {
    setMedia(undefined);
    signedIn();
    renderApp(`/video?with=${RIYA}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('does not support video calls');
  });
});

/* ---------- caller ---------- */

describe('placing a call', () => {
  it('rings, negotiates after acceptance and is connected only when the peer connection is', async () => {
    signedIn();
    renderApp(`/video?with=${RIYA}`);

    await waitFor(() => expect(status()).toBe('Calling Riya Shah…'));
    expect(requests('call:initiate')).toEqual([{ userId: RIYA }]);
    expect(peers).toHaveLength(0); // no media is sent before acceptance

    act(() => fake.fire('call:accepted', { call: call({ status: 'accepted' }) }));
    await waitFor(() => expect(requests('call:offer')).toEqual([{ callId: 55, description: { type: 'offer', sdp: 'fake-offer' } }]));
    const pc = peers[0];
    expect(pc.config.iceServers).toEqual([{ urls: ['stun:stun.example.com'] }]);
    expect(pc.tracks).toEqual(localStream.getTracks());
    expect(status()).toBe('Connecting…');

    // ICE candidates that arrive before the answer are applied after it.
    act(() => fake.fire('call:ice-candidate', { callId: 55, candidate: { candidate: 'c1' } }));
    act(() => fake.fire('call:answer', { callId: 55, description: { type: 'answer', sdp: 'remote' } }));
    await waitFor(() => expect(pc.remoteDescription).toEqual({ type: 'answer', sdp: 'remote' }));
    await waitFor(() => expect(pc.candidates).toEqual([{ candidate: 'c1' }]));
    expect(requests('call:connected')).toHaveLength(0);

    act(() => {
      pc.remoteTrack();
      pc.set('connected');
    });
    await waitFor(() => expect(status()).toBe('Connected'));
    expect(screen.getByTestId('remote-video')).toBeVisible();
    expect(requests('call:connected')).toEqual([{ callId: 55 }]);
  });

  it('shows busy and releases the camera', async () => {
    fake.request = vi.fn(async () => ({ success: true, busy: true, call: call({ status: 'busy', direction: 'outgoing' }) }));
    signedIn();
    renderApp(`/video?with=${RIYA}`);
    expect(await screen.findByText('The user is on another call. Try again later.')).toBeInTheDocument();
    localStream.getTracks().forEach((t) => expect(t.stop).toHaveBeenCalled());
  });

  it('shows the server refusal for users who may not call', async () => {
    fake.request = vi.fn(async () => ({ success: false, code: 403, error: 'Video calls are available only between connected users.' }));
    signedIn();
    renderApp(`/video?with=${RIYA}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('only between connected users');
    localStream.getTracks().forEach((t) => expect(t.stop).toHaveBeenCalled());
  });

  it('tries an ICE restart when the connection fails', async () => {
    signedIn();
    renderApp(`/video?with=${RIYA}`);
    await waitFor(() => expect(status()).toMatch(/Calling/));
    act(() => fake.fire('call:accepted', { call: call({ status: 'accepted' }) }));
    await waitFor(() => expect(peers).toHaveLength(1));
    act(() => peers[0].set('failed'));
    await waitFor(() => expect(peers[0].offerOptions).toEqual([{ iceRestart: false }, { iceRestart: true }]));
    expect(status()).toBe('Connection interrupted. Reconnecting…');
  });

  it('reports a connection that never recovers as failed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      signedIn();
      renderApp(`/video?with=${RIYA}`);
      await waitFor(() => expect(status()).toMatch(/Calling/));
      act(() => fake.fire('call:accepted', { call: call({ status: 'accepted' }) }));
      await waitFor(() => expect(peers).toHaveLength(1));
      act(() => peers[0].set('disconnected'));
      await act(async () => vi.advanceTimersByTime(16000));
      await waitFor(() => expect(requests('call:failed')).toEqual([{ callId: 55, reason: 'connection_failed' }]));
      expect(await screen.findByRole('alert')).toHaveTextContent('could not be restored');
      expect(peers[0].closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ---------- receiver ---------- */

describe('incoming calls', () => {
  it('shows one dialog per call and stops ringing when it is answered elsewhere', async () => {
    signedIn();
    renderApp('/dashboard');
    await screen.findByRole('heading', { name: /welcome/i });
    await subscribed('call:incoming');

    act(() => {
      fake.fire('call:incoming', { call: call(), caller: RIYA_CARD });
      fake.fire('call:incoming', { call: call(), caller: RIYA_CARD }); // duplicate
    });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(screen.getByText('Incoming video call…')).toBeInTheDocument();
    expect(screen.getByText('Riya Shah')).toBeInTheDocument();

    act(() => fake.fire('call:accepted', { call: call({ status: 'accepted' }) }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('rejects from the dialog', async () => {
    signedIn();
    renderApp('/dashboard');
    await screen.findByRole('heading', { name: /welcome/i });
    await subscribed('call:incoming');
    act(() => fake.fire('call:incoming', { call: call(), caller: RIYA_CARD }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(requests('call:reject')).toEqual([{ callId: 55 }]));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('accepts: camera first, then call:accept, then answers the caller’s offer', async () => {
    const getUserMedia = vi.fn(async () => localStream);
    setMedia(getUserMedia);
    signedIn({ 'GET /calls/55': ok({ call: call() }) });
    renderApp('/dashboard');
    await screen.findByRole('heading', { name: /welcome/i });
    await subscribed('call:incoming');
    act(() => fake.fire('call:incoming', { call: call(), caller: RIYA_CARD }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/video'));
    await waitFor(() => expect(requests('call:accept')).toEqual([{ callId: 55 }]));
    expect(getUserMedia.mock.invocationCallOrder[0]).toBeLessThan(fake.request.mock.invocationCallOrder.find((_, i) => fake.request.mock.calls[i][0] === 'call:accept'));
    expect(status()).toBe('Connecting…');

    act(() => fake.fire('call:offer', { callId: 55, description: { type: 'offer', sdp: 'remote-offer' } }));
    await waitFor(() => expect(requests('call:answer')).toEqual([{ callId: 55, description: { type: 'answer', sdp: 'fake-answer' } }]));
    expect(peers[0].remoteDescription).toEqual({ type: 'offer', sdp: 'remote-offer' });
  });

  it('shows the result instead of a call that already ended', async () => {
    signedIn({ 'GET /calls/55': ok({ call: call({ status: 'missed', endReason: 'no_answer' }) }) });
    renderApp('/video?call=55');
    expect(await screen.findByText('No answer.')).toBeInTheDocument();
    expect(requests('call:accept')).toHaveLength(0);
  });
});

/* ---------- controls and cleanup ---------- */

describe('controls and ending', () => {
  async function connectedCall() {
    signedIn();
    const view = renderApp(`/video?with=${RIYA}`);
    await waitFor(() => expect(status()).toMatch(/Calling/));
    act(() => fake.fire('call:accepted', { call: call({ status: 'accepted' }) }));
    await waitFor(() => expect(peers).toHaveLength(1));
    act(() => peers[0].set('connected'));
    await waitFor(() => expect(status()).toBe('Connected'));
    return view;
  }

  it('mutes/unmutes the microphone and turns the camera off/on without ending the call', async () => {
    await connectedCall();
    const [audio] = localStream.getAudioTracks();
    const [video] = localStream.getVideoTracks();

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(audio.enabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(audio.enabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Camera off' }));
    expect(video.enabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Camera on' }));
    expect(video.enabled).toBe(true);

    expect(status()).toBe('Connected');
    expect(video.stop).not.toHaveBeenCalled();
  });

  it('ends the call: tells the server, closes the connection and stops every track', async () => {
    await connectedCall();
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    expect(await screen.findByText(/Call ended\. Duration 0:42\./)).toBeInTheDocument();
    expect(requests('call:end')).toEqual([{ callId: 55, reason: 'hangup' }]);
    expect(peers[0].closed).toBe(true);
    localStream.getTracks().forEach((t) => expect(t.stop).toHaveBeenCalled());
  });

  it('ends when the other side hangs up', async () => {
    await connectedCall();
    act(() => fake.fire('call:ended', { call: call({ status: 'ended', endReason: 'hangup', durationSeconds: 5 }) }));
    expect(await screen.findByText(/Call ended/)).toBeInTheDocument();
    localStream.getTracks().forEach((t) => expect(t.stop).toHaveBeenCalled());
  });

  it('shows reconnecting when the other side drops, and renegotiates when it is back', async () => {
    await connectedCall();
    act(() => fake.fire('call:peer-left', { callId: 55, userId: RIYA }));
    expect(status()).toBe('Connection interrupted. Reconnecting…');
    act(() => fake.fire('call:peer-rejoined', { callId: 55, userId: RIYA }));
    await waitFor(() => expect(peers).toHaveLength(2)); // fresh peer connection
    expect(peers[0].closed).toBe(true);
    await waitFor(() => expect(requests('call:offer')).toHaveLength(2));
  });

  it('ends the call and frees the devices when the user navigates away', async () => {
    await connectedCall();
    fireEvent.click(screen.getByRole('link', { name: 'Messages' }));
    await waitFor(() => expect(fake.emit).toHaveBeenCalledWith('call:end', { callId: 55, reason: 'navigated_away' }));
    expect(peers[0].closed).toBe(true);
    localStream.getTracks().forEach((t) => expect(t.stop).toHaveBeenCalled());
  });
});

/* ---------- history ---------- */

describe('call history page', () => {
  it('lists the user’s calls', async () => {
    signedIn({
      'GET /calls/history': ok({
        calls: [call({ id: 9, status: 'ended', durationSeconds: 125, direction: 'outgoing' }), call({ id: 8, status: 'missed' })],
        pagination: { limit: 20, hasMore: false, nextCursor: null },
      }),
    });
    renderApp('/calls');
    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]).getByText('Completed')).toBeInTheDocument();
    expect(within(items[0]).getByText(/Outgoing .* 2:05/)).toBeInTheDocument();
    expect(within(items[1]).getByText('Missed')).toBeInTheDocument();
  });
});
